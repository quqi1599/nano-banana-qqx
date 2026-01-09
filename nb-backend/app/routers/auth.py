"""
认证路由：注册、登录、验证码、密码管理
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel, EmailStr
import redis.asyncio as redis

from app.database import get_db
from app.models.user import User
from app.models.login_history import LoginHistory
from app.models.email_code import EmailCode
from app.schemas.user import UserRegister, UserLogin, UserResponse, TokenResponse
from app.utils.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
)
from app.config import get_settings
from app.utils.rate_limiter import RateLimiter
from app.services.email_service import generate_code, send_verification_code

router = APIRouter()
settings = get_settings()

# 限制发送验证码：每邮箱每分钟 1 次
send_code_limiter = RateLimiter(times=1, seconds=60)


# Redis 连接
async def get_redis():
    r = redis.from_url(settings.redis_url, decode_responses=True)
    try:
        yield r
    finally:
        await r.aclose()


# 安全限制常量
IP_REGISTER_LIMIT = 5  # 每 IP 24小时最多注册次数
LOGIN_FAIL_LIMIT = 10  # 登录失败锁定次数
LIMIT_EXPIRE_SECONDS = 86400  # 24小时


class SendCodeRequest(BaseModel):
    """发送验证码请求"""
    email: EmailStr
    purpose: str = "register"  # register 或 reset


class UserRegisterWithCode(BaseModel):
    """带验证码的注册请求"""
    email: EmailStr
    password: str
    nickname: str | None = None
    code: str


class ResetPasswordRequest(BaseModel):
    """重置密码请求"""
    email: EmailStr
    code: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    """修改密码请求"""
    old_password: str
    new_password: str


@router.post("/send-code", dependencies=[Depends(send_code_limiter)])
async def send_code(
    data: SendCodeRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """发送邮箱验证码"""
    from app.models.email_whitelist import EmailWhitelist
    
    client_ip = request.client.host
    
    # 检查 IP 注册次数限制（仅注册时）
    if data.purpose == "register":
        ip_key = f"register_ip:{client_ip}"
        ip_count = await redis_client.get(ip_key)
        if ip_count and int(ip_count) >= IP_REGISTER_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"该 IP 今日注册次数已达上限 ({IP_REGISTER_LIMIT} 次)，请 24 小时后重试",
            )
    
    # 检查邮箱后缀白名单
    whitelist_result = await db.execute(
        select(EmailWhitelist).where(EmailWhitelist.is_active == True)
    )
    whitelist = whitelist_result.scalars().all()
    
    if whitelist:
        email_lower = data.email.lower()
        allowed = any(email_lower.endswith(w.suffix) for w in whitelist)
        if not allowed:
            allowed_suffixes = ", ".join(w.suffix for w in whitelist[:5])
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"该邮箱不在允许范围内，仅支持: {allowed_suffixes}",
            )
    
    # 注册时检查邮箱是否已存在
    if data.purpose == "register":
        result = await db.execute(select(User).where(User.email == data.email))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该邮箱已被注册",
            )
    
    # 重置密码时检查邮箱是否存在
    if data.purpose == "reset":
        result = await db.execute(select(User).where(User.email == data.email))
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该邮箱未注册",
            )
    
    # 生成验证码
    code = generate_code()
    expires_at = datetime.utcnow() + timedelta(minutes=settings.email_code_expire_minutes)
    
    # 保存验证码
    email_code = EmailCode(
        email=data.email,
        code=code,
        purpose=data.purpose,
        expires_at=expires_at,
    )
    db.add(email_code)
    await db.commit()
    
    # 后台发送邮件
    background_tasks.add_task(send_verification_code, data.email, code, data.purpose)
    
    return {"message": "验证码已发送，请查收邮箱"}


@router.post("/register", response_model=TokenResponse)
async def register(
    data: UserRegisterWithCode,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """用户注册（需验证码）"""
    client_ip = request.client.host
    ip_key = f"register_ip:{client_ip}"
    
    # 检查 IP 注册次数限制
    ip_count = await redis_client.get(ip_key)
    if ip_count and int(ip_count) >= IP_REGISTER_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"该 IP 今日注册次数已达上限 ({IP_REGISTER_LIMIT} 次)，请 24 小时后重试",
        )
    
    # 检查邮箱是否已存在
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册",
        )
    
    # 验证验证码
    now = datetime.utcnow()
    result = await db.execute(
        select(EmailCode).where(
            and_(
                EmailCode.email == data.email,
                EmailCode.code == data.code,
                EmailCode.purpose == "register",
                EmailCode.is_used == False,
                EmailCode.expires_at > now,
            )
        ).order_by(EmailCode.created_at.desc()).limit(1)
    )
    email_code = result.scalar_one_or_none()
    
    if not email_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码无效或已过期",
        )
    
    # 标记验证码已使用
    email_code.is_used = True
    
    # 创建用户
    user = User(
        email=data.email,
        password_hash=get_password_hash(data.password),
        nickname=data.nickname or data.email.split("@")[0],
        credit_balance=0,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # 增加 IP 注册计数
    await redis_client.incr(ip_key)
    await redis_client.expire(ip_key, LIMIT_EXPIRE_SECONDS)
    
    # 生成 Token
    access_token = create_access_token(data={"sub": user.id})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """用户登录"""
    client_ip = request.client.host
    email_key = f"login_fail:{data.email}"
    
    # 检查登录失败次数
    fail_count = await redis_client.get(email_key)
    if fail_count and int(fail_count) >= LOGIN_FAIL_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录失败次数过多，账户已被临时锁定，请 24 小时后重试",
        )
    
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(data.password, user.password_hash):
        # 增加失败计数
        await redis_client.incr(email_key)
        await redis_client.expire(email_key, LIMIT_EXPIRE_SECONDS)
        
        current_fails = await redis_client.get(email_key)
        remaining = LOGIN_FAIL_LIMIT - int(current_fails) if current_fails else LOGIN_FAIL_LIMIT - 1
        
        if remaining <= 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="登录失败次数过多，账户已被临时锁定，请 24 小时后重试",
            )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"邮箱或密码错误，还剩 {remaining} 次尝试机会",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用",
        )
    
    # 登录成功，清除失败计数
    await redis_client.delete(email_key)
    
    access_token = create_access_token(data={"sub": user.id})
    
    # 记录登录信息
    user.last_login_at = datetime.utcnow()
    user.last_login_ip = client_ip
    
    login_record = LoginHistory(
        user_id=user.id,
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(login_record)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """通过验证码重置密码"""
    # 验证验证码
    now = datetime.utcnow()
    result = await db.execute(
        select(EmailCode).where(
            and_(
                EmailCode.email == data.email,
                EmailCode.code == data.code,
                EmailCode.purpose == "reset",
                EmailCode.is_used == False,
                EmailCode.expires_at > now,
            )
        ).order_by(EmailCode.created_at.desc()).limit(1)
    )
    email_code = result.scalar_one_or_none()
    
    if not email_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码无效或已过期",
        )
    
    # 获取用户
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )
    
    # 更新密码
    user.password_hash = get_password_hash(data.new_password)
    email_code.is_used = True
    
    # 清除登录失败计数
    email_key = f"login_fail:{data.email}"
    await redis_client.delete(email_key)
    
    await db.commit()
    
    return {"message": "密码重置成功，请使用新密码登录"}


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """修改密码（需登录）"""
    # 验证旧密码
    if not verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前密码错误",
        )
    
    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码长度至少 6 位",
        )
    
    # 更新密码
    current_user.password_hash = get_password_hash(data.new_password)
    await db.commit()
    
    return {"message": "密码修改成功"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return UserResponse.model_validate(current_user)
