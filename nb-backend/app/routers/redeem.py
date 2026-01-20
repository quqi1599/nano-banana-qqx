"""
兑换码路由
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.redeem_code import RedeemCode
from app.models.credit import CreditTransaction, TransactionType
from app.schemas.redeem import RedeemRequest, RedeemResponse, RedeemCodeInfo
from app.utils.security import get_current_user
from app.utils.redis_client import redis_client

router = APIRouter()

REDEEM_RATE_LIMIT = 5
REDEEM_RATE_WINDOW_SECONDS = 60


async def _enforce_redeem_rate_limit(user_id: str, request: Request) -> None:
    if not redis_client:
        return

    key = f"rate_limit:redeem:{user_id}"
    current = await redis_client.get(key)

    if current and int(current) >= REDEEM_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="请求过于频繁，请稍后再试",
        )

    async with redis_client.pipeline() as pipe:
        await pipe.incr(key)
        if not current:
            await pipe.expire(key, REDEEM_RATE_WINDOW_SECONDS)
        await pipe.execute()


@router.post("/use", response_model=RedeemResponse)
async def use_redeem_code(
    data: RedeemRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """兑换码兑换积分"""
    await _enforce_redeem_rate_limit(current_user.id, request)

    # 查找兑换码
    code = data.code.strip().upper()
    credits_added = 0
    pro3_added = 0
    flash_added = 0
    locked_user = None

    result = await db.execute(
        select(RedeemCode)
        .where(RedeemCode.code == code)
        .with_for_update()
    )
    redeem_code = result.scalar_one_or_none()

    if not redeem_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="兑换码不存在",
        )

    if redeem_code.is_used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="兑换码已被使用",
        )

    if redeem_code.expires_at and redeem_code.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="兑换码已过期",
        )

    # 检查是否有任何灵感值可兑换
    if redeem_code.credit_amount == 0 and redeem_code.pro3_credits == 0 and redeem_code.flash_credits == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="兑换码无可用灵感值",
        )

    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    locked_user = user_result.scalar_one_or_none()
    if not locked_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )

    # 兑换积分
    credits_added = redeem_code.credit_amount
    pro3_added = redeem_code.pro3_credits
    flash_added = redeem_code.flash_credits

    locked_user.credit_balance += credits_added
    locked_user.pro3_balance += pro3_added
    locked_user.flash_balance += flash_added

    # 标记兑换码已使用
    redeem_code.is_used = True
    redeem_code.used_by = locked_user.id
    redeem_code.used_at = datetime.utcnow()

    # 记录交易（通用积分）
    if credits_added > 0:
        transaction = CreditTransaction(
            user_id=locked_user.id,
            amount=credits_added,
            type=TransactionType.REDEEM.value,
            description=f"兑换码兑换(通用): {code[:4]}****",
            balance_after=locked_user.credit_balance,
        )
        db.add(transaction)

    # 记录 Pro3 积分交易
    if pro3_added > 0:
        transaction = CreditTransaction(
            user_id=locked_user.id,
            amount=pro3_added,
            type=TransactionType.REDEEM.value,
            description=f"兑换码兑换(Pro3): {code[:4]}****",
            balance_after=locked_user.pro3_balance,
        )
        db.add(transaction)

    # 记录 Flash 积分交易
    if flash_added > 0:
        transaction = CreditTransaction(
            user_id=locked_user.id,
            amount=flash_added,
            type=TransactionType.REDEEM.value,
            description=f"兑换码兑换(Flash): {code[:4]}****",
            balance_after=locked_user.flash_balance,
        )
        db.add(transaction)

    general_balance = locked_user.credit_balance
    pro3_balance = locked_user.pro3_balance
    flash_balance = locked_user.flash_balance
    total_balance = general_balance + pro3_balance + flash_balance

    return RedeemResponse(
        success=True,
        message="兑换成功",
        credits_added=credits_added,
        pro3_credits_added=pro3_added,
        flash_credits_added=flash_added,
        new_balance=general_balance,
        general_balance=general_balance,
        pro3_balance=pro3_balance,
        flash_balance=flash_balance,
        total_balance=total_balance,
    )


@router.get("/balance", response_model=dict)
async def get_user_balance(
    current_user: User = Depends(get_current_user),
):
    """获取用户各类型余额"""
    return {
        "general_balance": current_user.credit_balance,
        "pro3_balance": current_user.pro3_balance,
        "flash_balance": current_user.flash_balance,
        "total_balance": current_user.credit_balance + current_user.pro3_balance + current_user.flash_balance,
    }
