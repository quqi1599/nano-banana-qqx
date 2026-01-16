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

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

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
            for key in ("message", "detail", "error", "status"):
                value = error.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            code = error.get("code")
            if code is not None:
                return str(code)
        for key in ("message", "detail", "error"):
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
) -> None:
    async with db.begin():
        await db.refresh(token, with_for_update=True)
        if key_updates:
            for field, value in key_updates.items():
                setattr(token, field, value)
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
    """获取可用的 Token 列表（按优先级轮询）"""
    now = datetime.utcnow()
    query = (
        select(TokenPool)
        .where(TokenPool.is_active == True)
        .where(
            (TokenPool.cooldown_until == None) | (TokenPool.cooldown_until <= now)
        )
        .order_by(TokenPool.priority.desc())
        .order_by(TokenPool.last_used_at.asc().nullsfirst())
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


async def reserve_user_credits(
    db: AsyncSession,
    user_id: str,
    credits_to_use: int,
    model_name: str,
) -> int:
    async with db.begin():
        result = await db.execute(
            update(User)
            .where(User.id == user_id, User.credit_balance >= credits_to_use)
            .values(credit_balance=User.credit_balance - credits_to_use)
            .returning(User.credit_balance)
        )
        balance_after = result.scalar_one_or_none()
        if balance_after is None:
            balance_result = await db.execute(
                select(User.credit_balance).where(User.id == user_id)
            )
            current_balance = balance_result.scalar_one_or_none()
            if current_balance is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="用户不存在",
                )
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"次数不足，需要 {credits_to_use} 次，当前余额 {current_balance}",
            )
        db.add(CreditTransaction(
            user_id=user_id,
            amount=-credits_to_use,
            type=TransactionType.CONSUME.value,
            description=f"使用模型: {model_name}",
            balance_after=balance_after,
        ))
        return balance_after


async def refund_user_credits(
    db: AsyncSession,
    user_id: str,
    credits_to_refund: int,
    model_name: str,
    reason: str,
) -> None:
    async with db.begin():
        result = await db.execute(
            update(User)
            .where(User.id == user_id)
            .values(credit_balance=User.credit_balance + credits_to_refund)
            .returning(User.credit_balance)
        )
        balance_after = result.scalar_one_or_none()
        if balance_after is None:
            return
        db.add(CreditTransaction(
            user_id=user_id,
            amount=credits_to_refund,
            type=TransactionType.BONUS.value,
            description=f"{reason}: {model_name}",
            balance_after=balance_after,
        ))


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
    # 获取请求体
    body = await request.json()
    model_name = body.get("model", "gemini-3-pro-image-preview")

    # 验证模型名称白名单
    validate_model_name(model_name)

    # 计算消耗次数
    credits_to_use = await get_credits_for_model(db, model_name)

    reserved = False
    try:
        await reserve_user_credits(db, current_user.id, credits_to_use, model_name)
        reserved = True
    except HTTPException:
        raise

    # 获取可用 Token 列表
    try:
        tokens = await get_available_tokens(db)
        await db.commit()
    except HTTPException:
        if reserved:
            await refund_user_credits(
                db,
                current_user.id,
                credits_to_use,
                model_name,
                "请求失败退款",
            )
        raise

    # 提取 prompt 预览
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
            target_url = f"{settings.newapi_base_url}/v1beta/models/{model_name}:generateContent"
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

            headers = {
                "Content-Type": "application/json",
                "x-goog-api-key": plain_key,
            }

            try:
                response = await client.post(target_url, json=body, headers=headers)
            except httpx.TimeoutException:
                usage_log = UsageLog(
                    user_id=current_user.id,
                    model_name=model_name,
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
                    data = response.json()
                except ValueError:
                    usage_log = UsageLog(
                        user_id=current_user.id,
                        model_name=model_name,
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

                usage_log = UsageLog(
                    user_id=current_user.id,
                    model_name=model_name,
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
            if response.status_code >= 500 or response.status_code in {401, 403, 429}:
                mark_failure = True
            else:
                mark_failure = False
            usage_log = UsageLog(
                user_id=current_user.id,
                model_name=model_name,
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
                mark_failure=mark_failure,
                key_updates=key_updates,
                usage_log=usage_log,
            )

            if response.status_code == 400:
                if reserved:
                    await refund_user_credits(
                        db,
                        current_user.id,
                        credits_to_use,
                        model_name,
                        "请求失败退款",
                    )
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
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"暂无可用的 API Token，请稍后重试。{last_error_detail or ''}".strip(),
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

    # 验证模型名称白名单
    validate_model_name(model_name)

    credits_to_use = await get_credits_for_model(db, model_name)

    reserved = False
    try:
        await reserve_user_credits(db, current_user.id, credits_to_use, model_name)
        reserved = True
    except HTTPException:
        raise

    try:
        tokens = await get_available_tokens(db)
        await db.commit()
    except HTTPException:
        if reserved:
            await refund_user_credits(
                db,
                current_user.id,
                credits_to_use,
                model_name,
                "请求失败退款",
            )
        raise
    prompt_preview = ""
    contents = body.get("contents", [])
    if contents and len(contents) > 0:
        parts = contents[-1].get("parts", [])
        for part in parts:
            if "text" in part:
                prompt_preview = part["text"][:200]
                break

    async def stream_response_with_cleanup():
        """使用 async context manager 确保连接正确关闭"""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                selected_token = None
                selected_key_updates = None
                last_error_detail = None

                for token in tokens:
                    now = datetime.utcnow()
                    target_url = f"{settings.newapi_base_url}/v1beta/models/{model_name}:streamGenerateContent"
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

                    headers = {
                        "Content-Type": "application/json",
                        "x-goog-api-key": plain_key,
                    }

                    try:
                        request_obj = client.build_request("POST", target_url, json=body, headers=headers)
                        response = await client.send(request_obj, stream=True)
                    except httpx.TimeoutException:
                        usage_log = UsageLog(
                            user_id=current_user.id,
                            model_name=model_name,
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

                        # 记录成功日志
                        usage_log = UsageLog(
                            user_id=current_user.id,
                            model_name=model_name,
                            credits_used=credits_to_use,
                            token_id=selected_token.id,
                            request_type="generate_stream",
                            prompt_preview=prompt_preview,
                            is_success=True,
                            error_message=None,
                        )
                        await _apply_token_update(
                            db,
                            selected_token,
                            datetime.utcnow(),
                            update_request_counters=True,
                            mark_success=True,
                            key_updates=selected_key_updates,
                            usage_log=usage_log,
                        )

                        # 流式传输
                        try:
                            async for chunk in response.aiter_bytes():
                                yield chunk
                        finally:
                            await response.aclose()
                        return

                    body_bytes = await response.aread()
                    error_detail = _safe_error_detail_from_bytes(status_code, body_bytes)
                    last_error_detail = error_detail or f"HTTP {status_code}"
                    if status_code >= 500 or status_code in {401, 403, 429}:
                        mark_failure = True
                    else:
                        mark_failure = False
                    usage_log = UsageLog(
                        user_id=current_user.id,
                        model_name=model_name,
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
                        mark_failure=mark_failure,
                        key_updates=key_updates,
                        usage_log=usage_log,
                    )
                    await response.aclose()

                    if status_code == 400:
                        if reserved:
                            await refund_user_credits(
                                db,
                                current_user.id,
                                credits_to_use,
                                model_name,
                                "请求失败退款",
                            )
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=last_error_detail or "请求参数错误",
                        )

                # 所有 token 都失败
                if reserved:
                    await refund_user_credits(
                        db,
                        current_user.id,
                        credits_to_use,
                        model_name,
                        "请求失败退款",
                    )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"暂无可用的 API Token，请稍后重试。{last_error_detail or ''}".strip(),
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"请求失败: {str(e)}",
            )

    return StreamingResponse(stream_response_with_cleanup(), media_type="application/json")
