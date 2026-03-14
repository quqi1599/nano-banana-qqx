"""
API 代理路由 - 代理前端请求到 NewAPI
"""
from datetime import datetime, timedelta
import json
import logging
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import httpx

from app.database import get_db
from app.models.user import User
from app.models.token_pool import TokenPool
from app.models.usage_log import UsageLog
from app.models.credit import CreditTransaction, TransactionType
from app.models.model_pricing import ModelPricing
from app.utils.security import get_current_user
from app.utils.token_security import decrypt_api_key, encrypt_api_key, hash_api_key, build_key_parts
from app.config import get_settings
from app.services.credit_service import (
    CreditService,
    CreditOperationError,
    reserve_user_credits,
    refund_user_credits,
)
from app.services.alert_service import send_token_exhausted_alert, send_token_failed_alert

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

REQUEST_MODE_GOOGLE_NATIVE = "google_native"
REQUEST_MODE_OPENAI_COMPATIBLE = "openai_compatible"

_SECRET_KV_PATTERN = re.compile(
    r"(?i)(api[-_ ]?key|authorization|token)\s*[:=]\s*([A-Za-z0-9\-_=]{8,})"
)
_SECRET_VALUE_PATTERN = re.compile(r"(?:sk-[A-Za-z0-9]{8,}|AIza[0-9A-Za-z\-_]{10,})")
_LONG_TOKEN_PATTERN = re.compile(r"(?<![A-Za-z0-9])[A-Za-z0-9\-_]{32,}(?![A-Za-z0-9])")


def _sanitize_error_detail(text: str) -> str:
    if not text:
        return ""
    sanitized = _SECRET_KV_PATTERN.sub(r"\1=***", text)
    sanitized = _SECRET_VALUE_PATTERN.sub("***", sanitized)
    sanitized = _LONG_TOKEN_PATTERN.sub("***", sanitized)
    sanitized = " ".join(sanitized.split())
    return sanitized[:200]


def _extract_error_message(payload: Any) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            for key in ("message", "detail", "error", "status", "msg"):
                value = error.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            code = error.get("code")
            if code is not None:
                return str(code)
        for key in ("message", "detail", "error", "msg"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _safe_error_detail_from_response(response: httpx.Response) -> str:
    payload = None
    try:
        payload = response.json()
    except ValueError:
        payload = None
    message = _extract_error_message(payload) if payload is not None else ""
    if not message:
        message = f"HTTP {response.status_code}"
    return _sanitize_error_detail(message)


def _safe_error_detail_from_bytes(status_code: int, body: bytes) -> str:
    message = ""
    if body:
        try:
            payload = json.loads(body.decode("utf-8", errors="ignore"))
        except ValueError:
            payload = None
        if payload is not None:
            message = _extract_error_message(payload)
    if not message:
        message = f"HTTP {status_code}"
    return _sanitize_error_detail(message)


def _extract_candidate_parts(payload: Any) -> list[Any]:
    if not isinstance(payload, dict):
        return []
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return []
    candidate = candidates[0]
    if not isinstance(candidate, dict):
        return []
    content = candidate.get("content")
    if not isinstance(content, dict):
        return []
    parts = content.get("parts")
    if not isinstance(parts, list) or not parts:
        return []
    return parts


def _has_candidate_content(payload: Any) -> bool:
    return bool(_extract_candidate_parts(payload))


_BLOCKED_FINISH_REASONS = {"SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT"}
_BLOCKED_PROMPT_REASONS = {"SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT"}


def _extract_finish_reason(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    candidate = candidates[0]
    if not isinstance(candidate, dict):
        return ""
    reason = candidate.get("finishReason")
    if isinstance(reason, str):
        return reason.strip().upper()
    return ""


def _extract_prompt_block_reason(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    prompt_feedback = payload.get("promptFeedback")
    if not isinstance(prompt_feedback, dict):
        return ""
    block_reason = prompt_feedback.get("blockReason")
    if isinstance(block_reason, str):
        return block_reason.strip().upper()
    return ""


def _has_blocked_safety_rating(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False

    def _ratings_blocked(container: Any) -> bool:
        if not isinstance(container, dict):
            return False
        ratings = container.get("safetyRatings")
        if not isinstance(ratings, list):
            return False
        return any(
            isinstance(rating, dict) and bool(rating.get("blocked")) is True
            for rating in ratings
        )

    if _ratings_blocked(payload.get("promptFeedback")):
        return True

    candidates = payload.get("candidates")
    if isinstance(candidates, list):
        for candidate in candidates:
            if _ratings_blocked(candidate):
                return True
    return False


def _is_safety_blocked_empty_response(payload: Any) -> bool:
    finish_reason = _extract_finish_reason(payload)
    if finish_reason in _BLOCKED_FINISH_REASONS:
        return True

    prompt_block_reason = _extract_prompt_block_reason(payload)
    if prompt_block_reason in _BLOCKED_PROMPT_REASONS:
        return True

    return _has_blocked_safety_rating(payload)


def _describe_empty_response(payload: Any) -> str:
    prompt_block_reason = _extract_prompt_block_reason(payload)
    if prompt_block_reason:
        return f"No content generated (prompt blocked: {prompt_block_reason})"

    finish_reason = _extract_finish_reason(payload)
    if finish_reason:
        return f"No content generated (finish reason: {finish_reason})"

    return "No content generated"


_QUOTA_ERROR_HINTS = (
    "quota",
    "insufficient",
    "insufficient_quota",
    "exceeded",
    "billing",
    "credit",
    "credits",
    "balance",
    "余额",
    "额度",
    "次数不足",
    "没有额度",
    "账户余额不足",
    "resource has been exhausted",
    "exceeded your current quota",
)

_RATE_LIMIT_HINTS = (
    "rate limit",
    "too many requests",
    "request limit",
    "频率",
    "请求过于频繁",
)


def _matches_any_hint(text: str, hints: tuple[str, ...]) -> bool:
    for hint in hints:
        if hint in text:
            return True
    return False


def _is_quota_error(detail: str) -> bool:
    if not detail:
        return False
    lowered = detail.lower()
    return _matches_any_hint(lowered, _QUOTA_ERROR_HINTS)


def _is_rate_limit_error(detail: str) -> bool:
    if not detail:
        return False
    lowered = detail.lower()
    return _matches_any_hint(lowered, _RATE_LIMIT_HINTS)


def _normalize_request_mode(raw_value: Any) -> str:
    if raw_value is None:
        return REQUEST_MODE_GOOGLE_NATIVE
    if not isinstance(raw_value, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="request_mode 必须是字符串",
        )

    normalized = raw_value.strip().lower().replace("-", "_")
    if normalized in {"google", "native", "google_native", "gemini"}:
        return REQUEST_MODE_GOOGLE_NATIVE
    if normalized in {"openai", "openai_compatible", "openai_compat"}:
        return REQUEST_MODE_OPENAI_COMPATIBLE

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"不支持的请求模式: {raw_value}",
    )


def _strip_request_mode(body: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(body)
    sanitized.pop("request_mode", None)
    return sanitized


def _append_gemini_text_part(parts: list[dict[str, Any]], text: str, *, thought: bool = False) -> None:
    if not text:
        return
    if parts and "text" in parts[-1] and bool(parts[-1].get("thought")) is thought:
        parts[-1]["text"] += text
        return
    part: dict[str, Any] = {"text": text}
    if thought:
        part["thought"] = True
    parts.append(part)


def _append_gemini_image_part(parts: list[dict[str, Any]], mime_type: str, data: str) -> None:
    if not data:
        return
    parts.append({
        "inlineData": {
            "mimeType": mime_type or "image/png",
            "data": data,
        }
    })


def _append_gemini_image_url_part(parts: list[dict[str, Any]], url: str) -> None:
    match = re.match(r"^data:(.+?);base64,(.+)$", url, re.IGNORECASE)
    if match:
        _append_gemini_image_part(parts, match.group(1), match.group(2))
        return
    _append_gemini_text_part(parts, url)


def _append_openai_block_as_gemini_part(
    parts: list[dict[str, Any]],
    block: Any,
    *,
    thought: bool = False,
) -> None:
    if block is None:
        return

    if isinstance(block, str):
        _append_gemini_text_part(parts, block, thought=thought)
        return

    if isinstance(block, list):
        for item in block:
            _append_openai_block_as_gemini_part(parts, item, thought=thought)
        return

    if not isinstance(block, dict):
        return

    reasoning_content = block.get("reasoning_content")
    if isinstance(reasoning_content, str):
        _append_gemini_text_part(parts, reasoning_content, thought=True)

    block_type = block.get("type")
    if block_type in {"reasoning", "thinking"}:
        text = block.get("text") or block.get("value") or ""
        if isinstance(text, str):
            _append_gemini_text_part(parts, text, thought=True)
        return

    if block_type in {"text", "input_text", "output_text"}:
        text = block.get("text") or block.get("value") or ""
        if isinstance(text, str):
            _append_gemini_text_part(parts, text, thought=thought)
        return

    if block_type in {"image_url", "input_image", "output_image"}:
        if isinstance(block.get("b64_json"), str):
            _append_gemini_image_part(
                parts,
                str(block.get("mime_type") or "image/png"),
                block["b64_json"],
            )
            return

        image_url = block.get("image_url")
        if isinstance(image_url, dict):
            image_url = image_url.get("url")
        if not isinstance(image_url, str):
            image_url = block.get("url")
        if isinstance(image_url, str) and image_url:
            _append_gemini_image_url_part(parts, image_url)
        return

    if isinstance(block.get("b64_json"), str):
        _append_gemini_image_part(
            parts,
            str(block.get("mime_type") or "image/png"),
            block["b64_json"],
        )
        return

    text = block.get("text")
    if isinstance(text, str):
        _append_gemini_text_part(parts, text, thought=thought)


def _extract_openai_image_parts(items: Any) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    if not isinstance(items, list):
        return parts

    for item in items:
        if not isinstance(item, dict):
            continue
        b64_json = item.get("b64_json")
        if isinstance(b64_json, str):
            _append_gemini_image_part(
                parts,
                str(item.get("mime_type") or "image/png"),
                b64_json,
            )
            continue
        image_url = item.get("url")
        if isinstance(image_url, str) and image_url:
            _append_gemini_image_url_part(parts, image_url)
    return parts


def _extract_openai_message_parts(message: Any) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    if not isinstance(message, dict):
        return parts

    reasoning_content = message.get("reasoning_content")
    if isinstance(reasoning_content, str):
        _append_gemini_text_part(parts, reasoning_content, thought=True)

    reasoning = message.get("reasoning")
    if isinstance(reasoning, list):
        for item in reasoning:
            _append_openai_block_as_gemini_part(parts, item, thought=True)

    _append_openai_block_as_gemini_part(parts, message.get("content"))
    parts.extend(_extract_openai_image_parts(message.get("images")))
    return parts


def _normalize_openai_finish_reason(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    normalized = value.strip().upper()
    if normalized == "CONTENT_FILTER":
        return "SAFETY"
    return normalized


def _normalize_openai_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {"candidates": []}

    choices = payload.get("choices")
    choice = choices[0] if isinstance(choices, list) and choices else {}
    if not isinstance(choice, dict):
        choice = {}

    message_parts = _extract_openai_message_parts(choice.get("message"))
    if not message_parts:
        message_parts = _extract_openai_image_parts(payload.get("data"))

    candidate: dict[str, Any] = {}
    if message_parts:
        candidate["content"] = {"parts": message_parts}

    finish_reason = _normalize_openai_finish_reason(choice.get("finish_reason"))
    if finish_reason:
        candidate["finishReason"] = finish_reason

    normalized: dict[str, Any] = {"candidates": [candidate] if candidate else []}
    if finish_reason == "SAFETY":
        normalized["promptFeedback"] = {"blockReason": "SAFETY"}
    return normalized


def _convert_native_part_to_openai_block(part: Any) -> list[dict[str, Any]]:
    if not isinstance(part, dict):
        return []

    if isinstance(part.get("text"), str) and part["text"].strip():
        return [{"type": "text", "text": part["text"]}]

    inline_data = part.get("inlineData")
    if isinstance(inline_data, dict):
        mime_type = inline_data.get("mimeType") or "image/png"
        data = inline_data.get("data")
        if isinstance(data, str) and data:
            return [{
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{data}"},
            }]
    return []


def _convert_native_contents_to_openai_messages(contents: Any) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    if not isinstance(contents, list):
        return messages

    for item in contents:
        if not isinstance(item, dict):
            continue

        role = item.get("role")
        if role == "model":
            mapped_role = "assistant"
        elif role == "user":
            mapped_role = "user"
        else:
            mapped_role = "user"

        blocks: list[dict[str, Any]] = []
        parts = item.get("parts")
        if isinstance(parts, list):
            for part in parts:
                blocks.extend(_convert_native_part_to_openai_block(part))

        if not blocks:
            continue

        has_non_text = any(block.get("type") != "text" for block in blocks)
        if has_non_text:
            content: Any = blocks
        else:
            content = "\n\n".join(
                block["text"]
                for block in blocks
                if isinstance(block.get("text"), str) and block["text"]
            )

        messages.append({
            "role": mapped_role,
            "content": content,
        })

    return messages


def _build_google_target_url(model_name: str, *, stream: bool) -> str:
    suffix = "streamGenerateContent" if stream else "generateContent"
    base_url = settings.newapi_base_url.rstrip("/")
    if base_url.endswith("/v1beta"):
        return f"{base_url}/models/{model_name}:{suffix}"
    return f"{base_url}/v1beta/models/{model_name}:{suffix}"


def _build_openai_target_url() -> str:
    base_url = settings.newapi_base_url.rstrip("/")
    if base_url.endswith("/chat/completions"):
        return base_url
    if (
        base_url.endswith("/v1")
        or base_url.endswith("/openai")
        or base_url.endswith("/v1beta/openai")
    ):
        return f"{base_url}/chat/completions"
    return f"{base_url}/v1/chat/completions"


def _build_openai_payload(body: dict[str, Any], model_name: str, *, stream: bool) -> dict[str, Any]:
    config = body.get("config")
    config_dict = config if isinstance(config, dict) else {}

    payload: dict[str, Any] = {
        "model": model_name,
        "messages": _convert_native_contents_to_openai_messages(body.get("contents")),
        "stream": stream,
    }

    response_modalities = config_dict.get("responseModalities")
    if isinstance(response_modalities, list) and response_modalities:
        payload["modalities"] = [str(item).lower() for item in response_modalities]

    image_config = config_dict.get("imageConfig")
    if isinstance(image_config, dict) and image_config:
        payload["image_config"] = image_config

    tools = config_dict.get("tools")
    if isinstance(tools, list) and tools:
        payload["tools"] = [{"type": "google_search"}]

    return payload


def _build_upstream_request(
    body: dict[str, Any],
    model_name: str,
    request_mode: str,
    plain_key: str,
    *,
    stream: bool,
) -> tuple[str, dict[str, str], dict[str, Any]]:
    sanitized_body = _strip_request_mode(body)

    if request_mode == REQUEST_MODE_OPENAI_COMPATIBLE:
        return (
            _build_openai_target_url(),
            {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {plain_key}",
            },
            _build_openai_payload(sanitized_body, model_name, stream=stream),
        )

    return (
        _build_google_target_url(model_name, stream=stream),
        {
            "Content-Type": "application/json",
            "x-goog-api-key": plain_key,
        },
        sanitized_body,
    )


def _normalize_success_payload(payload: Any, request_mode: str) -> dict[str, Any]:
    if request_mode == REQUEST_MODE_OPENAI_COMPATIBLE:
        return _normalize_openai_payload(payload)
    if isinstance(payload, dict):
        return payload
    return {"candidates": []}


def _normalize_openai_stream_line(line: bytes) -> dict[str, Any] | None:
    decoded = line.strip()
    if not decoded:
        return None
    if decoded.startswith(b"data:"):
        decoded = decoded[5:].strip()
    if not decoded or decoded == b"[DONE]":
        return None
    payload = json.loads(decoded.decode("utf-8", errors="ignore"))
    return _normalize_openai_payload(payload)


def _build_usage_log(
    *,
    user_id: str,
    model_name: str,
    request_mode: str,
    credits_used: int,
    token_id: str | None,
    request_type: str,
    prompt_preview: str,
    is_success: bool,
    error_message: str | None,
) -> UsageLog:
    return UsageLog(
        user_id=user_id,
        model_name=model_name,
        request_mode=request_mode,
        credits_used=credits_used,
        token_id=token_id,
        request_type=request_type,
        prompt_preview=prompt_preview,
        is_success=is_success,
        error_message=error_message,
    )


def _build_key_updates(token: TokenPool, plain_key: str) -> dict[str, str]:
    if not settings.token_encryption_key or token.api_key.startswith("enc:"):
        return {}
    updates: dict[str, str] = {
        "api_key": encrypt_api_key(plain_key),
    }
    if not token.api_key_hash:
        updates["api_key_hash"] = hash_api_key(plain_key)
    if not token.api_key_prefix or not token.api_key_suffix:
        prefix, suffix = build_key_parts(plain_key)
        if not token.api_key_prefix:
            updates["api_key_prefix"] = prefix
        if not token.api_key_suffix:
            updates["api_key_suffix"] = suffix
    return updates


async def _commit_changes(db: AsyncSession) -> None:
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise


async def _apply_token_update(
    db: AsyncSession,
    token: TokenPool,
    now: datetime,
    *,
    update_request_counters: bool,
    mark_failure: bool = False,
    mark_success: bool = False,
    key_updates: dict[str, str] | None = None,
    usage_log: UsageLog | None = None,
    disable_token: bool = False,
    remaining_quota: float | None = None,
    error_message: str = "",
    is_auth_failure: bool = False,
) -> None:
    await db.refresh(token, with_for_update=True)
    if key_updates:
        for field, value in key_updates.items():
            setattr(token, field, value)
    if remaining_quota is not None:
        token.remaining_quota = remaining_quota
        token.last_checked_at = now
    if disable_token:
        token.is_active = False
        token.cooldown_until = None
    if update_request_counters:
        token.last_used_at = now
        token.last_checked_at = now
        token.total_requests += 1
    if mark_failure:
        mark_token_failure(token, now)
    elif mark_success:
        mark_token_success(token)
    if usage_log:
        db.add(usage_log)

    await _commit_changes(db)
    
    # 触发 Token 告警
    if disable_token:
        # 额度耗尽告警
        try:
            send_token_exhausted_alert(
                token_name=token.name or "未命名Token",
                token_id=token.id,
                error_msg=error_message
            )
        except Exception as e:
            logger.error(f"发送Token额度告警失败: {e}")
    elif is_auth_failure:
        # 认证失败告警
        try:
            send_token_failed_alert(
                token_name=token.name or "未命名Token",
                token_id=token.id,
                error_msg=error_message
            )
        except Exception as e:
            logger.error(f"发送Token认证失败告警失败: {e}")


def validate_model_name(model_name: str) -> None:
    """验证模型名称是否在白名单中"""
    allowed = settings.allowed_models_list
    if not allowed:
        # 空列表表示允许所有模型（开发模式）
        return

    if model_name not in allowed:
        logger.warning(f"拒绝使用未授权的模型: {model_name}，允许的模型: {allowed}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"模型 '{model_name}' 不在允许列表中，请联系管理员",
        )


async def get_credits_for_model(db: AsyncSession, model_name: str) -> int:
    """根据模型获取消耗次数"""
    result = await db.execute(
        select(ModelPricing).where(ModelPricing.model_name == model_name)
    )
    pricing = result.scalar_one_or_none()
    if pricing:
        return pricing.credits_per_request

    model_lower = model_name.lower()
    if "flash" in model_lower or "2.5" in model_lower:
        return settings.credits_gemini_25_flash
    if "gemini-3" in model_lower or "gemini3" in model_lower:
        return settings.credits_gemini_3_pro
    return settings.credits_gemini_3_pro  # 默认


async def get_available_tokens(db: AsyncSession, lock: bool = False) -> list[TokenPool]:
    """获取可用的 Token 列表（智能负载均衡）

    负载均衡策略：
    1. 首先按优先级降序排列（高优先级优先）
    2. 相同优先级内，按使用次数升序（使用少的优先，避免热点）
    3. 使用次数相同时，按最后使用时间升序（最久未使用的优先）
    4. 从未使用过的（last_used_at IS NULL）优先

    这样可以：
    - 确保高优先级 token 优先被使用
    - 在同优先级内实现负载均衡，避免单个 token 过载
    - 自动分散请求到多个 token
    """
    now = datetime.utcnow()
    query = (
        select(TokenPool)
        .where(TokenPool.is_active == True)
        .where(
            (TokenPool.cooldown_until == None) | (TokenPool.cooldown_until <= now)
        )
        # 排序策略：优先级 > 使用频率 > 最后使用时间
        .order_by(TokenPool.priority.desc())  # 高优先级在前
        .order_by(TokenPool.total_requests.asc())  # 使用少的在前（负载均衡）
        .order_by(TokenPool.last_used_at.asc().nullsfirst())  # 最久未使用的在前
    )
    # Avoid holding row locks during upstream calls; lock only when updating token state.

    result = await db.execute(query)
    tokens = result.scalars().all()

    if not tokens:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="暂无可用的 API Token，请联系管理员",
        )

    return tokens


def mark_token_failure(token: TokenPool, now: datetime) -> None:
    token.failure_count += 1
    token.last_failure_at = now
    if token.failure_count >= settings.token_disable_threshold:
        token.is_active = False
    elif token.failure_count >= settings.token_failure_threshold:
        token.cooldown_until = now + timedelta(seconds=settings.token_cooldown_seconds)


def mark_token_success(token: TokenPool) -> None:
    token.failure_count = 0
    token.cooldown_until = None
    token.last_failure_at = None


@router.post("/generate")
async def proxy_generate(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    代理 Gemini API 请求
    1. 检查用户次数余额
    2. 从 Token 池选取可用 Token
    3. 转发请求到 NewAPI
    4. 扣除用户次数
    5. 记录使用日志
    """
    body = await request.json()
    model_name = body.get("model", "gemini-3-pro-image-preview")
    request_mode = _normalize_request_mode(body.get("request_mode"))

    validate_model_name(model_name)
    credits_to_use = await get_credits_for_model(db, model_name)

    reserved = False
    try:
        await reserve_user_credits(db, current_user.id, credits_to_use, model_name)
        reserved = True
        await _commit_changes(db)
    except HTTPException:
        raise

    try:
        tokens = await get_available_tokens(db)
    except HTTPException:
        if reserved:
            await refund_user_credits(
                db,
                current_user.id,
                credits_to_use,
                model_name,
                "请求失败退款",
            )
            await _commit_changes(db)
        raise

    prompt_preview = ""
    contents = body.get("contents", [])
    if contents and len(contents) > 0:
        parts = contents[-1].get("parts", [])
        for part in parts:
            if "text" in part:
                prompt_preview = part["text"][:200]
                break

    last_error_detail = None
    async with httpx.AsyncClient(timeout=120.0) as client:
        for token in tokens:
            now = datetime.utcnow()
            try:
                plain_key = decrypt_api_key(token.api_key)
            except RuntimeError as e:
                logger.error(
                    f"Token 解密失败: token_id={token.id}, "
                    f"error_type={type(e).__name__}, "
                    f"error={str(e)[:200]}"
                )
                await _apply_token_update(
                    db,
                    token,
                    now,
                    update_request_counters=False,
                    mark_failure=True,
                )
                last_error_detail = f"Token 解密失败: {type(e).__name__}"
                continue

            key_updates = _build_key_updates(token, plain_key)
            target_url, headers, request_payload = _build_upstream_request(
                body,
                model_name,
                request_mode,
                plain_key,
                stream=False,
            )

            try:
                response = await client.post(target_url, json=request_payload, headers=headers)
            except httpx.TimeoutException:
                usage_log = _build_usage_log(
                    user_id=current_user.id,
                    model_name=model_name,
                    request_mode=request_mode,
                    credits_used=0,
                    token_id=token.id,
                    request_type="generate",
                    prompt_preview=prompt_preview,
                    is_success=False,
                    error_message="API 请求超时",
                )
                await _apply_token_update(
                    db,
                    token,
                    now,
                    update_request_counters=True,
                    mark_failure=True,
                    key_updates=key_updates,
                    usage_log=usage_log,
                )
                last_error_detail = "API 请求超时"
                continue

            if response.status_code == 200:
                try:
                    raw_data = response.json()
                except ValueError:
                    usage_log = _build_usage_log(
                        user_id=current_user.id,
                        model_name=model_name,
                        request_mode=request_mode,
                        credits_used=0,
                        token_id=token.id,
                        request_type="generate",
                        prompt_preview=prompt_preview,
                        is_success=False,
                        error_message="上游响应格式错误",
                    )
                    await _apply_token_update(
                        db,
                        token,
                        now,
                        update_request_counters=True,
                        mark_failure=True,
                        key_updates=key_updates,
                        usage_log=usage_log,
                    )
                    last_error_detail = "上游响应格式错误"
                    continue

                data = _normalize_success_payload(raw_data, request_mode)
                if not _has_candidate_content(data):
                    empty_detail = _describe_empty_response(data)
                    is_safety_blocked = _is_safety_blocked_empty_response(data)
                    usage_log = _build_usage_log(
                        user_id=current_user.id,
                        model_name=model_name,
                        request_mode=request_mode,
                        credits_used=0,
                        token_id=token.id,
                        request_type="generate",
                        prompt_preview=prompt_preview,
                        is_success=False,
                        error_message=empty_detail,
                    )
                    await _apply_token_update(
                        db,
                        token,
                        now,
                        update_request_counters=True,
                        mark_failure=not is_safety_blocked,
                        mark_success=is_safety_blocked,
                        key_updates=key_updates,
                        usage_log=usage_log,
                    )
                    if is_safety_blocked:
                        if reserved:
                            await refund_user_credits(
                                db,
                                current_user.id,
                                credits_to_use,
                                model_name,
                                "生成内容为空退款",
                            )
                            await _commit_changes(db)
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=empty_detail,
                        )
                    last_error_detail = empty_detail
                    continue

                usage_log = _build_usage_log(
                    user_id=current_user.id,
                    model_name=model_name,
                    request_mode=request_mode,
                    credits_used=credits_to_use,
                    token_id=token.id,
                    request_type="generate",
                    prompt_preview=prompt_preview,
                    is_success=True,
                    error_message=None,
                )
                await _apply_token_update(
                    db,
                    token,
                    now,
                    update_request_counters=True,
                    mark_success=True,
                    key_updates=key_updates,
                    usage_log=usage_log,
                )
                return data

            error_detail = _safe_error_detail_from_response(response)
            last_error_detail = error_detail or f"HTTP {response.status_code}"
            quota_error = response.status_code == 402 or _is_quota_error(last_error_detail)
            rate_limit_error = _is_rate_limit_error(last_error_detail)
            retryable_error = (
                response.status_code >= 500
                or response.status_code in {401, 403, 408, 429}
                or quota_error
                or rate_limit_error
            )
            disable_token = quota_error and not rate_limit_error
            usage_log = _build_usage_log(
                user_id=current_user.id,
                model_name=model_name,
                request_mode=request_mode,
                credits_used=0,
                token_id=token.id,
                request_type="generate",
                prompt_preview=prompt_preview,
                is_success=False,
                error_message=last_error_detail,
            )
            await _apply_token_update(
                db,
                token,
                now,
                update_request_counters=True,
                mark_failure=retryable_error,
                key_updates=key_updates,
                usage_log=usage_log,
                disable_token=disable_token,
                remaining_quota=0.0 if disable_token else None,
                error_message=last_error_detail,
                is_auth_failure=response.status_code in {401, 403},
            )

            if response.status_code == 400 and not quota_error:
                if reserved:
                    await refund_user_credits(
                        db,
                        current_user.id,
                        credits_to_use,
                        model_name,
                        "请求失败退款",
                    )
                    await _commit_changes(db)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=last_error_detail or "请求参数错误",
                )

    if reserved:
        await refund_user_credits(
            db,
            current_user.id,
            credits_to_use,
            model_name,
            "请求失败退款",
        )
        await _commit_changes(db)
    if last_error_detail and last_error_detail.startswith("No content generated"):
        detail_message = last_error_detail
    else:
        detail_message = f"暂无可用的 API Token，请稍后重试。{last_error_detail or ''}".strip()
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=detail_message,
    )


@router.post("/generate/stream")
async def proxy_generate_stream(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    流式代理 Gemini API 请求
    """
    body = await request.json()
    model_name = body.get("model", "gemini-3-pro-image-preview")
    request_mode = _normalize_request_mode(body.get("request_mode"))

    validate_model_name(model_name)
    credits_to_use = await get_credits_for_model(db, model_name)

    reserved = False
    try:
        await reserve_user_credits(db, current_user.id, credits_to_use, model_name)
        reserved = True
        await _commit_changes(db)
    except HTTPException:
        raise

    try:
        tokens = await get_available_tokens(db)
    except HTTPException:
        if reserved:
            await refund_user_credits(
                db,
                current_user.id,
                credits_to_use,
                model_name,
                "请求失败退款",
            )
            await _commit_changes(db)
        raise
    prompt_preview = ""
    contents = body.get("contents", [])
    if contents and len(contents) > 0:
        parts = contents[-1].get("parts", [])
        for part in parts:
            if "text" in part:
                prompt_preview = part["text"][:200]
                break

    last_error_detail = None
    client = httpx.AsyncClient(timeout=120.0)
    selected_token = None
    selected_key_updates = None
    selected_response = None
    try:
        for token in tokens:
            now = datetime.utcnow()
            try:
                plain_key = decrypt_api_key(token.api_key)
            except RuntimeError:
                await _apply_token_update(
                    db,
                    token,
                    now,
                    update_request_counters=False,
                    mark_failure=True,
                )
                last_error_detail = "Token 解密失败"
                continue

            key_updates = _build_key_updates(token, plain_key)
            target_url, headers, request_payload = _build_upstream_request(
                body,
                model_name,
                request_mode,
                plain_key,
                stream=True,
            )

            try:
                request_obj = client.build_request("POST", target_url, json=request_payload, headers=headers)
                response = await client.send(request_obj, stream=True)
            except httpx.TimeoutException:
                usage_log = _build_usage_log(
                    user_id=current_user.id,
                    model_name=model_name,
                    request_mode=request_mode,
                    credits_used=0,
                    token_id=token.id,
                    request_type="generate_stream",
                    prompt_preview=prompt_preview,
                    is_success=False,
                    error_message="API 请求超时",
                )
                await _apply_token_update(
                    db,
                    token,
                    now,
                    update_request_counters=True,
                    mark_failure=True,
                    key_updates=key_updates,
                    usage_log=usage_log,
                )
                last_error_detail = "API 请求超时"
                continue

            status_code = response.status_code
            if status_code == 200:
                selected_token = token
                selected_key_updates = key_updates
                selected_response = response
                break

            body_bytes = await response.aread()
            error_detail = _safe_error_detail_from_bytes(status_code, body_bytes)
            last_error_detail = error_detail or f"HTTP {status_code}"
            quota_error = status_code == 402 or _is_quota_error(last_error_detail)
            rate_limit_error = _is_rate_limit_error(last_error_detail)
            retryable_error = (
                status_code >= 500
                or status_code in {401, 403, 408, 429}
                or quota_error
                or rate_limit_error
            )
            disable_token = quota_error and not rate_limit_error
            usage_log = _build_usage_log(
                user_id=current_user.id,
                model_name=model_name,
                request_mode=request_mode,
                credits_used=0,
                token_id=token.id,
                request_type="generate_stream",
                prompt_preview=prompt_preview,
                is_success=False,
                error_message=last_error_detail,
            )
            await _apply_token_update(
                db,
                token,
                now,
                update_request_counters=True,
                mark_failure=retryable_error,
                key_updates=key_updates,
                usage_log=usage_log,
                disable_token=disable_token,
                remaining_quota=0.0 if disable_token else None,
                error_message=last_error_detail,
                is_auth_failure=status_code in {401, 403},
            )
            await response.aclose()

            if status_code == 400 and not quota_error:
                if reserved:
                    await refund_user_credits(
                        db,
                        current_user.id,
                        credits_to_use,
                        model_name,
                        "请求失败退款",
                    )
                    await _commit_changes(db)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=last_error_detail or "请求参数错误",
                )

        if selected_response is None:
            if reserved:
                await refund_user_credits(
                    db,
                    current_user.id,
                    credits_to_use,
                    model_name,
                    "请求失败退款",
                )
                await _commit_changes(db)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"暂无可用的 API Token，请稍后重试。{last_error_detail or ''}".strip(),
            )
    except HTTPException:
        if selected_response is not None:
            await selected_response.aclose()
        await client.aclose()
        raise
    except Exception as e:
        if selected_response is not None:
            await selected_response.aclose()
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"请求失败: {str(e)}",
        )

    async def stream_response_with_cleanup():
        """使用 async context manager 确保连接正确关闭"""
        has_content = False
        last_payload: Any = None
        stream_error = None
        try:
            buffer = b""
            async for chunk in selected_response.aiter_bytes():
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    if not line.strip():
                        continue

                    if request_mode == REQUEST_MODE_OPENAI_COMPATIBLE:
                        try:
                            payload = _normalize_openai_stream_line(line)
                        except ValueError:
                            continue
                        if payload is None:
                            continue
                        last_payload = payload
                        has_content = has_content or _has_candidate_content(payload)
                        yield json.dumps(payload).encode("utf-8") + b"\n"
                        continue

                    if not has_content:
                        try:
                            decoded = line.strip()
                            if decoded.startswith(b"data:"):
                                decoded = decoded[5:].strip()
                            payload = json.loads(decoded.decode("utf-8", errors="ignore"))
                            last_payload = payload
                            has_content = _has_candidate_content(payload)
                        except ValueError:
                            pass
                    yield line + b"\n"

            if buffer.strip():
                if request_mode == REQUEST_MODE_OPENAI_COMPATIBLE:
                    try:
                        payload = _normalize_openai_stream_line(buffer)
                    except ValueError:
                        payload = None
                    if payload is not None:
                        last_payload = payload
                        has_content = has_content or _has_candidate_content(payload)
                        yield json.dumps(payload).encode("utf-8") + b"\n"
                else:
                    if not has_content:
                        try:
                            decoded = buffer.strip()
                            if decoded.startswith(b"data:"):
                                decoded = decoded[5:].strip()
                            payload = json.loads(decoded.decode("utf-8", errors="ignore"))
                            last_payload = payload
                            has_content = _has_candidate_content(payload)
                        except ValueError:
                            pass
                    yield buffer
        except Exception as exc:
            stream_error = exc
        finally:
            await selected_response.aclose()
            await client.aclose()

        if stream_error:
            logger.error("Stream response failed: %s", str(stream_error)[:200])
            return

        if selected_token is None:
            return

        empty_detail = _describe_empty_response(last_payload) if not has_content else None
        is_safety_blocked = (
            _is_safety_blocked_empty_response(last_payload)
            if not has_content
            else False
        )
        usage_log = _build_usage_log(
            user_id=current_user.id,
            model_name=model_name,
            request_mode=request_mode,
            credits_used=credits_to_use if has_content else 0,
            token_id=selected_token.id,
            request_type="generate_stream",
            prompt_preview=prompt_preview,
            is_success=has_content,
            error_message=empty_detail,
        )
        await _apply_token_update(
            db,
            selected_token,
            datetime.utcnow(),
            update_request_counters=True,
            mark_failure=not has_content and not is_safety_blocked,
            mark_success=has_content or is_safety_blocked,
            key_updates=selected_key_updates,
            usage_log=usage_log,
        )
        if not has_content and reserved:
            await refund_user_credits(
                db,
                current_user.id,
                credits_to_use,
                model_name,
                "生成内容为空退款",
            )
            await _commit_changes(db)
        return

    return StreamingResponse(stream_response_with_cleanup(), media_type="application/json")
