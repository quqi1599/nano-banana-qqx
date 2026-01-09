"""
管理后台路由
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

from app.database import get_db
from app.models.user import User
from app.models.token_pool import TokenPool
from app.models.redeem_code import RedeemCode, generate_redeem_code
from app.models.usage_log import UsageLog
from app.schemas.admin import (
    TokenPoolCreate,
    TokenPoolResponse,
    TokenPoolUpdate,
    UserListResponse,
    AdminUserResponse,
    DashboardStats,
    DailyStats,
    ModelStats,
    UserNoteUpdate,
)
from app.schemas.redeem import GenerateCodesRequest, GenerateCodesResponse, RedeemCodeInfo
from app.utils.security import get_admin_user

router = APIRouter()


# ============ Token 池管理 ============

@router.get("/tokens", response_model=list[TokenPoolResponse])
async def list_tokens(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取所有 Token"""
    result = await db.execute(
        select(TokenPool).order_by(TokenPool.priority.desc())
    )
    tokens = result.scalars().all()
    
    # 隐藏部分 API Key
    response = []
    for token in tokens:
        token_dict = TokenPoolResponse.model_validate(token).model_dump()
        # 只显示前8位和后4位
        api_key = token.api_key
        if len(api_key) > 12:
            token_dict["api_key"] = f"{api_key[:8]}...{api_key[-4:]}"
        response.append(TokenPoolResponse(**token_dict))
    
    return response


@router.post("/tokens", response_model=TokenPoolResponse)
async def add_token(
    data: TokenPoolCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """添加新 Token"""
    # 检查是否已存在
    result = await db.execute(
        select(TokenPool).where(TokenPool.api_key == data.api_key)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该 Token 已存在",
        )
    
    token = TokenPool(
        name=data.name,
        api_key=data.api_key,
        priority=data.priority,
    )
    db.add(token)
    await db.commit()
    await db.refresh(token)
    
    return TokenPoolResponse.model_validate(token)


@router.put("/tokens/{token_id}", response_model=TokenPoolResponse)
async def update_token(
    token_id: str,
    data: TokenPoolUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新 Token"""
    result = await db.execute(select(TokenPool).where(TokenPool.id == token_id))
    token = result.scalar_one_or_none()
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token 不存在",
        )
    
    if data.name is not None:
        token.name = data.name
    if data.is_active is not None:
        token.is_active = data.is_active
    if data.priority is not None:
        token.priority = data.priority
    
    await db.commit()
    await db.refresh(token)
    
    return TokenPoolResponse.model_validate(token)


@router.delete("/tokens/{token_id}")
async def delete_token(
    token_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """删除 Token"""
    result = await db.execute(select(TokenPool).where(TokenPool.id == token_id))
    token = result.scalar_one_or_none()
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token 不存在",
        )
    
    await db.delete(token)
    await db.commit()
    
    return {"message": "删除成功"}


# ============ 兑换码管理 ============

@router.post("/redeem-codes/generate", response_model=GenerateCodesResponse)
async def generate_redeem_codes(
    data: GenerateCodesRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """批量生成兑换码"""
    batch_id = str(uuid.uuid4())
    expires_at = None
    if data.expires_days:
        expires_at = datetime.utcnow() + timedelta(days=data.expires_days)
    
    codes = []
    for _ in range(data.count):
        code = RedeemCode(
            credit_amount=data.credit_amount,
            batch_id=batch_id,
            expires_at=expires_at,
        )
        db.add(code)
        codes.append(code.code)
    
    await db.commit()
    
    return GenerateCodesResponse(
        batch_id=batch_id,
        codes=codes,
        count=data.count,
        credit_amount=data.credit_amount,
    )


@router.get("/redeem-codes", response_model=list[RedeemCodeInfo])
async def list_redeem_codes(
    batch_id: Optional[str] = None,
    is_used: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取兑换码列表"""
    query = select(RedeemCode)
    
    if batch_id:
        query = query.where(RedeemCode.batch_id == batch_id)
    if is_used is not None:
        query = query.where(RedeemCode.is_used == is_used)
    
    query = query.order_by(RedeemCode.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    codes = result.scalars().all()
    
    return [RedeemCodeInfo.model_validate(c) for c in codes]


# ============ 用户管理 ============

@router.get("/users", response_model=UserListResponse)
async def list_users(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户列表"""
    # 构建查询
    query = select(User)
    
    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) |
            (User.nickname.ilike(f"%{search}%"))
        )
    
    # 获取总数
    count_query = select(func.count(User.id))
    if search:
        count_query = count_query.where(
            (User.email.ilike(f"%{search}%")) |
            (User.nickname.ilike(f"%{search}%"))
        )
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0
    
    # 分页
    query = query.order_by(User.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    # 获取每个用户的使用次数
    user_responses = []
    for user in users:
        usage_result = await db.execute(
            select(func.count(UsageLog.id)).where(UsageLog.user_id == user.id)
        )
        total_usage = usage_result.scalar() or 0
        
        user_dict = AdminUserResponse.model_validate(user).model_dump()
        user_dict["total_usage"] = total_usage
        user_responses.append(AdminUserResponse(**user_dict))
    
    return UserListResponse(
        users=user_responses,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.put("/users/{user_id}/credits")
async def adjust_user_credits(
    user_id: str,
    amount: int,
    reason: str = "管理员调整",
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """调整用户积分"""
    from app.models.credit import CreditTransaction, TransactionType
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )
    
    user.credit_balance += amount
    
    transaction = CreditTransaction(
        user_id=user.id,
        amount=amount,
        type=TransactionType.BONUS.value if amount > 0 else TransactionType.CONSUME.value,
        description=reason,
        balance_after=user.credit_balance,
    )
    db.add(transaction)
    
    await db.commit()
    
    return {"message": "调整成功", "new_balance": user.credit_balance}


@router.put("/users/{user_id}/note")
async def update_user_note(
    user_id: str,
    data: UserNoteUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新用户备注"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )
    
    user.note = data.note
    await db.commit()
    
    return {"message": "备注更新成功"}
