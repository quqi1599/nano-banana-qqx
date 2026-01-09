"""
API 代理路由 - 代理前端请求到 NewAPI
"""
from datetime import datetime
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
from app.utils.security import get_current_user
from app.config import get_settings

router = APIRouter()
settings = get_settings()


def get_credits_for_model(model_name: str) -> int:
    """根据模型获取消耗积分"""
    if "gemini-3" in model_name.lower() or "gemini3" in model_name.lower():
        return settings.credits_gemini_3_pro
    elif "flash" in model_name.lower() or "2.5" in model_name:
        return settings.credits_gemini_25_flash
    else:
        return settings.credits_gemini_3_pro  # 默认


async def get_available_token(db: AsyncSession) -> TokenPool:
    """获取可用的 Token"""
    result = await db.execute(
        select(TokenPool)
        .where(TokenPool.is_active == True)
        .where(TokenPool.remaining_quota > 0)
        .order_by(TokenPool.priority.desc())
        .order_by(TokenPool.last_used_at.asc().nullsfirst())
        .limit(1)
    )
    token = result.scalar_one_or_none()
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="暂无可用的 API Token，请联系管理员",
        )
    
    return token


@router.post("/generate")
async def proxy_generate(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    代理 Gemini API 请求
    1. 检查用户积分余额
    2. 从 Token 池选取可用 Token
    3. 转发请求到 NewAPI
    4. 扣除用户积分
    5. 记录使用日志
    """
    # 获取请求体
    body = await request.json()
    model_name = body.get("model", "gemini-3-pro-image-preview")
    
    # 计算消耗积分
    credits_to_use = get_credits_for_model(model_name)
    
    # 检查余额
    if current_user.credit_balance < credits_to_use:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"积分不足，需要 {credits_to_use} 积分，当前余额 {current_user.credit_balance}",
        )
    
    # 获取可用 Token
    token = await get_available_token(db)
    
    # 构建请求
    target_url = f"{settings.newapi_base_url}/v1beta/models/{model_name}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": token.api_key,
    }
    
    # 提取 prompt 预览
    prompt_preview = ""
    contents = body.get("contents", [])
    if contents and len(contents) > 0:
        parts = contents[-1].get("parts", [])
        for part in parts:
            if "text" in part:
                prompt_preview = part["text"][:200]
                break
    
    try:
        # 发送请求
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(target_url, json=body, headers=headers)
        
        # 更新 Token 使用信息
        token.last_used_at = datetime.utcnow()
        token.total_requests += 1
        
        # 扣除积分
        current_user.credit_balance -= credits_to_use
        
        # 记录交易
        transaction = CreditTransaction(
            user_id=current_user.id,
            amount=-credits_to_use,
            type=TransactionType.CONSUME.value,
            description=f"使用模型: {model_name}",
            balance_after=current_user.credit_balance,
        )
        db.add(transaction)
        
        # 记录使用日志
        usage_log = UsageLog(
            user_id=current_user.id,
            model_name=model_name,
            credits_used=credits_to_use,
            token_id=token.id,
            request_type="generate",
            prompt_preview=prompt_preview,
            is_success=response.status_code == 200,
            error_message=None if response.status_code == 200 else response.text[:500],
        )
        db.add(usage_log)
        
        await db.commit()
        
        return response.json()
        
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="API 请求超时",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"API 请求失败: {str(e)}",
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
    
    credits_to_use = get_credits_for_model(model_name)
    
    if current_user.credit_balance < credits_to_use:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"积分不足，需要 {credits_to_use} 积分",
        )
    
    token = await get_available_token(db)
    
    # 先扣除积分
    current_user.credit_balance -= credits_to_use
    
    transaction = CreditTransaction(
        user_id=current_user.id,
        amount=-credits_to_use,
        type=TransactionType.CONSUME.value,
        description=f"使用模型: {model_name}",
        balance_after=current_user.credit_balance,
    )
    db.add(transaction)
    
    usage_log = UsageLog(
        user_id=current_user.id,
        model_name=model_name,
        credits_used=credits_to_use,
        token_id=token.id,
        request_type="generate_stream",
        is_success=True,
    )
    db.add(usage_log)
    
    token.last_used_at = datetime.utcnow()
    token.total_requests += 1
    
    await db.commit()
    
    # 流式响应
    target_url = f"{settings.newapi_base_url}/v1beta/models/{model_name}:streamGenerateContent"
    
    async def stream_response():
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                target_url,
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": token.api_key,
                },
            ) as response:
                async for chunk in response.aiter_bytes():
                    yield chunk
    
    return StreamingResponse(
        stream_response(),
        media_type="application/json",
    )
