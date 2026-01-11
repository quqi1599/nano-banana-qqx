"""
API 代理路由 - 代理前端请求到 NewAPI
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
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
    if lock:
        query = query.with_for_update()

    result = await db.execute(query)
    tokens = result.scalars().all()

    if not tokens:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="暂无可用的 API Token，请联系管理员",
        )

    return tokens


async def get_locked_user(db: AsyncSession, user_id: str) -> User:
    result = await db.execute(
        select(User).where(User.id == user_id).with_for_update()
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )
    return user


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

    # 计算消耗次数
    credits_to_use = await get_credits_for_model(db, model_name)

    locked_user = await get_locked_user(db, current_user.id)

    # 检查余额
    if locked_user.credit_balance < credits_to_use:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"次数不足，需要 {credits_to_use} 次，当前余额 {locked_user.credit_balance}",
        )

    # 获取可用 Token 列表
    tokens = await get_available_tokens(db, lock=True)

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
                mark_token_failure(token, now)
                last_error_detail = "Token 解密失败"
                continue

            if settings.token_encryption_key and not token.api_key.startswith("enc:"):
                token.api_key = encrypt_api_key(plain_key)
                if not token.api_key_hash:
                    token.api_key_hash = hash_api_key(plain_key)
                if not token.api_key_prefix or not token.api_key_suffix:
                    prefix, suffix = build_key_parts(plain_key)
                    token.api_key_prefix = prefix
                    token.api_key_suffix = suffix

            headers = {
                "Content-Type": "application/json",
                "x-goog-api-key": plain_key,
            }

            try:
                response = await client.post(target_url, json=body, headers=headers)
            except httpx.TimeoutException:
                token.last_used_at = now
                token.last_checked_at = now
                token.total_requests += 1
                mark_token_failure(token, now)
                db.add(UsageLog(
                    user_id=locked_user.id,
                    model_name=model_name,
                    credits_used=0,
                    token_id=token.id,
                    request_type="generate",
                    prompt_preview=prompt_preview,
                    is_success=False,
                    error_message="API 请求超时",
                ))
                last_error_detail = "API 请求超时"
                continue

            token.last_used_at = now
            token.last_checked_at = now
            token.total_requests += 1

            if response.status_code == 200:
                try:
                    data = response.json()
                except ValueError:
                    mark_token_failure(token, now)
                    db.add(UsageLog(
                        user_id=locked_user.id,
                        model_name=model_name,
                        credits_used=0,
                        token_id=token.id,
                        request_type="generate",
                        prompt_preview=prompt_preview,
                        is_success=False,
                        error_message="上游响应格式错误",
                    ))
                    last_error_detail = "上游响应格式错误"
                    continue

                # 扣除次数
                locked_user.credit_balance -= credits_to_use
                mark_token_success(token)

                # 记录交易
                db.add(CreditTransaction(
                    user_id=locked_user.id,
                    amount=-credits_to_use,
                    type=TransactionType.CONSUME.value,
                    description=f"使用模型: {model_name}",
                    balance_after=locked_user.credit_balance,
                ))

                # 记录使用日志
                db.add(UsageLog(
                    user_id=locked_user.id,
                    model_name=model_name,
                    credits_used=credits_to_use,
                    token_id=token.id,
                    request_type="generate",
                    prompt_preview=prompt_preview,
                    is_success=True,
                    error_message=None,
                ))

                await db.commit()
                return data

            error_text = response.text[:500]
            last_error_detail = error_text or f"HTTP {response.status_code}"
            if response.status_code >= 500 or response.status_code in {401, 403, 429}:
                mark_token_failure(token, now)
            db.add(UsageLog(
                user_id=locked_user.id,
                model_name=model_name,
                credits_used=0,
                token_id=token.id,
                request_type="generate",
                prompt_preview=prompt_preview,
                is_success=False,
                error_message=last_error_detail,
            ))

            if response.status_code == 400:
                await db.commit()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=last_error_detail or "请求参数错误",
                )

        await db.commit()

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

    credits_to_use = await get_credits_for_model(db, model_name)

    locked_user = await get_locked_user(db, current_user.id)

    if locked_user.credit_balance < credits_to_use:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"次数不足，需要 {credits_to_use} 次",
        )

    tokens = await get_available_tokens(db, lock=True)
    prompt_preview = ""
    contents = body.get("contents", [])
    if contents and len(contents) > 0:
        parts = contents[-1].get("parts", [])
        for part in parts:
            if "text" in part:
                prompt_preview = part["text"][:200]
                break

    client = httpx.AsyncClient(timeout=120.0)
    response = None
    selected_token = None
    last_error_detail = None

    for token in tokens:
        now = datetime.utcnow()
        target_url = f"{settings.newapi_base_url}/v1beta/models/{model_name}:streamGenerateContent"
        try:
            plain_key = decrypt_api_key(token.api_key)
        except RuntimeError:
            mark_token_failure(token, now)
            last_error_detail = "Token 解密失败"
            continue

        if settings.token_encryption_key and not token.api_key.startswith("enc:"):
            token.api_key = encrypt_api_key(plain_key)
            if not token.api_key_hash:
                token.api_key_hash = hash_api_key(plain_key)
            if not token.api_key_prefix or not token.api_key_suffix:
                prefix, suffix = build_key_parts(plain_key)
                token.api_key_prefix = prefix
                token.api_key_suffix = suffix

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": plain_key,
        }

        try:
            request_obj = client.build_request("POST", target_url, json=body, headers=headers)
            response = await client.send(request_obj, stream=True)
        except httpx.TimeoutException:
            token.last_used_at = now
            token.last_checked_at = now
            token.total_requests += 1
            mark_token_failure(token, now)
            db.add(UsageLog(
                user_id=locked_user.id,
                model_name=model_name,
                credits_used=0,
                token_id=token.id,
                request_type="generate_stream",
                prompt_preview=prompt_preview,
                is_success=False,
                error_message="API 请求超时",
            ))
            last_error_detail = "API 请求超时"
            continue

        token.last_used_at = now
        token.last_checked_at = now
        token.total_requests += 1

        status_code = response.status_code
        if status_code == 200:
            mark_token_success(token)
            selected_token = token
            break

        error_text = (await response.aread()).decode("utf-8", errors="ignore")[:500]
        last_error_detail = error_text or f"HTTP {status_code}"
        if status_code >= 500 or status_code in {401, 403, 429}:
            mark_token_failure(token, now)
        db.add(UsageLog(
            user_id=locked_user.id,
            model_name=model_name,
            credits_used=0,
            token_id=token.id,
            request_type="generate_stream",
            prompt_preview=prompt_preview,
            is_success=False,
            error_message=last_error_detail,
        ))
        await response.aclose()
        response = None

        if status_code == 400:
            await db.commit()
            await client.aclose()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=last_error_detail or "请求参数错误",
            )

    if not response or not selected_token:
        await db.commit()
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"暂无可用的 API Token，请稍后重试。{last_error_detail or ''}".strip(),
        )

    # 扣除次数
    locked_user.credit_balance -= credits_to_use
    db.add(CreditTransaction(
        user_id=locked_user.id,
        amount=-credits_to_use,
        type=TransactionType.CONSUME.value,
        description=f"使用模型: {model_name}",
        balance_after=locked_user.credit_balance,
    ))
    db.add(UsageLog(
        user_id=locked_user.id,
        model_name=model_name,
        credits_used=credits_to_use,
        token_id=selected_token.id,
        request_type="generate_stream",
        prompt_preview=prompt_preview,
        is_success=True,
        error_message=None,
    ))

    await db.commit()

    async def stream_response():
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(stream_response(), media_type="application/json")
