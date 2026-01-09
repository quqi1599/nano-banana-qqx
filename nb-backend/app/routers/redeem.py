"""
兑换码路由
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.redeem_code import RedeemCode
from app.models.credit import CreditTransaction, TransactionType
from app.schemas.redeem import RedeemRequest, RedeemResponse
from app.utils.security import get_current_user

router = APIRouter()


@router.post("/use", response_model=RedeemResponse)
async def use_redeem_code(
    data: RedeemRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """兑换码兑换积分"""
    # 查找兑换码
    code = data.code.strip().upper()
    result = await db.execute(
        select(RedeemCode).where(RedeemCode.code == code)
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
    
    # 兑换积分
    credits = redeem_code.credit_amount
    current_user.credit_balance += credits
    
    # 标记兑换码已使用
    redeem_code.is_used = True
    redeem_code.used_by = current_user.id
    redeem_code.used_at = datetime.utcnow()
    
    # 记录交易
    transaction = CreditTransaction(
        user_id=current_user.id,
        amount=credits,
        type=TransactionType.REDEEM.value,
        description=f"兑换码兑换: {code[:4]}****",
        balance_after=current_user.credit_balance,
    )
    db.add(transaction)
    
    await db.commit()
    
    return RedeemResponse(
        success=True,
        message="兑换成功",
        credits_added=credits,
        new_balance=current_user.credit_balance,
    )
