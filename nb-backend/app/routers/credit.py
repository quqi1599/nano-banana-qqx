"""
积分路由
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.user import User
from app.models.credit import CreditTransaction
from app.schemas.credit import CreditBalance, CreditHistoryResponse, CreditTransactionResponse
from app.utils.security import get_current_user

router = APIRouter()


@router.get("/balance", response_model=CreditBalance)
async def get_balance(current_user: User = Depends(get_current_user)):
    """获取积分余额"""
    return CreditBalance(balance=current_user.credit_balance)


@router.get("/history", response_model=CreditHistoryResponse)
async def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取积分交易记录"""
    # 获取总数
    count_result = await db.execute(
        select(func.count(CreditTransaction.id)).where(
            CreditTransaction.user_id == current_user.id
        )
    )
    total = count_result.scalar() or 0
    
    # 分页查询
    offset = (page - 1) * page_size
    result = await db.execute(
        select(CreditTransaction)
        .where(CreditTransaction.user_id == current_user.id)
        .order_by(CreditTransaction.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    transactions = result.scalars().all()
    
    return CreditHistoryResponse(
        transactions=[CreditTransactionResponse.model_validate(t) for t in transactions],
        total=total,
        page=page,
        page_size=page_size,
    )
