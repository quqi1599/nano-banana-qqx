"""
认证路由：注册、登录
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.credit import CreditTransaction, TransactionType
from app.models.login_history import LoginHistory
from app.schemas.user import UserRegister, UserLogin, UserResponse, TokenResponse
from app.utils.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
)
from app.config import get_settings

router = APIRouter()
settings = get_settings()


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """用户注册"""
    # 检查邮箱是否已存在
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册",
        )
    
    # 创建用户
    user = User(
        email=data.email,
        password_hash=get_password_hash(data.password),
        nickname=data.nickname or data.email.split("@")[0],
        credit_balance=settings.credits_new_user_bonus,  # 新用户赠送积分
    )
    db.add(user)
    await db.flush()
    
    # 记录赠送积分
    if settings.credits_new_user_bonus > 0:
        transaction = CreditTransaction(
            user_id=user.id,
            amount=settings.credits_new_user_bonus,
            type=TransactionType.BONUS.value,
            description="新用户注册赠送",
            balance_after=user.credit_balance,
        )
        db.add(transaction)
    
    await db.commit()
    await db.refresh(user)
    
    # 生成 Token
    access_token = create_access_token(data={"sub": user.id})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    """用户登录"""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用",
        )
    
    access_token = create_access_token(data={"sub": user.id})
    
    # 记录登录信息
    user.last_login_at = datetime.utcnow()
    user.last_login_ip = request.client.host
    
    login_record = LoginHistory(
        user_id=user.id,
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(login_record)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return UserResponse.model_validate(current_user)
