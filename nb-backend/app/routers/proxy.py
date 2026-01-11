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

    # 检查余额
    if current_user.credit_balance < credits_to_use:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"次数不足，需要 {credits_to_use} 次，当前余额 {current_user.credit_balance}",
        )

    # 获取可用 Token 列表
    tokens = await get_available_tokens(db)

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
            target_url = f"{settings.newapi_base_url}/v1beta/models/{model_name}:generateContent"
            headers = {
                "Content-Type": "application/json",
                "x-goog-api-key": token.api_key,
            }

            try:
                response = await client.post(target_url, json=body, headers=headers)
            except httpx.TimeoutException:
                token.last_used_at = datetime.utcnow()
                token.last_checked_at = datetime.utcnow()
                token.total_requests += 1
                db.add(UsageLog(
                    user_id=current_user.id,
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

            token.last_used_at = datetime.utcnow()
            token.last_checked_at = datetime.utcnow()
            token.total_requests += 1

            if response.status_code == 200:
                try:
                    data = response.json()
                except ValueError:
                    db.add(UsageLog(
                        user_id=current_user.id,
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
                current_user.credit_balance -= credits_to_use

                # 记录交易
                db.add(CreditTransaction(
                    user_id=current_user.id,
                    amount=-credits_to_use,
                    type=TransactionType.CONSUME.value,
                    description=f"使用模型: {model_name}",
                    balance_after=current_user.credit_balance,
                ))

                # 记录使用日志
                db.add(UsageLog(
                    user_id=current_user.id,
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
            db.add(UsageLog(
                user_id=current_user.id,
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

    if current_user.credit_balance < credits_to_use:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"次数不足，需要 {credits_to_use} 次",
        )

    tokens = await get_available_tokens(db)
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
        target_url = f"{settings.newapi_base_url}/v1beta/models/{model_name}:streamGenerateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": token.api_key,
        }

        try:
            request_obj = client.build_request("POST", target_url, json=body, headers=headers)
            response = await client.send(request_obj, stream=True)
        except httpx.TimeoutException:
            token.last_used_at = datetime.utcnow()
            token.last_checked_at = datetime.utcnow()
            token.total_requests += 1
            db.add(UsageLog(
                user_id=current_user.id,
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

        token.last_used_at = datetime.utcnow()
        token.last_checked_at = datetime.utcnow()
        token.total_requests += 1

        status_code = response.status_code
        if status_code == 200:
            selected_token = token
            break

        error_text = (await response.aread()).decode("utf-8", errors="ignore")[:500]
        last_error_detail = error_text or f"HTTP {status_code}"
        db.add(UsageLog(
            user_id=current_user.id,
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
    current_user.credit_balance -= credits_to_use
    db.add(CreditTransaction(
        user_id=current_user.id,
        amount=-credits_to_use,
        type=TransactionType.CONSUME.value,
        description=f"使用模型: {model_name}",
        balance_after=current_user.credit_balance,
    ))
    db.add(UsageLog(
        user_id=current_user.id,
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
