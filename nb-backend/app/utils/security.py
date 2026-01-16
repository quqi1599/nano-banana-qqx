"""
安全相关工具：JWT、密码哈希
"""
from datetime import datetime, timedelta
from typing import Optional
import hashlib
import secrets
import logging
import time
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Header, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.utils.redis_client import redis_client

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)
optional_security = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建 JWT Token"""
    to_encode = data.copy()
    if "jti" not in to_encode:
        to_encode["jti"] = secrets.token_urlsafe(16)
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(
        to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


def decode_token(token: str) -> dict:
    """解码 JWT Token"""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_token_from_request(
    credentials: Optional[HTTPAuthorizationCredentials],
    request: Optional[Request],
) -> Optional[str]:
    if credentials and credentials.credentials:
        return credentials.credentials
    if request:
        cookie_token = request.cookies.get(settings.auth_cookie_name)
        if cookie_token:
            return cookie_token
    return None


async def _ensure_token_not_revoked(payload: dict) -> None:
    if not settings.jwt_blacklist_enabled:
        return

    jti = payload.get("jti")
    if not jti:
        return

    if not redis_client:
        if settings.jwt_blacklist_fail_closed:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="认证服务不可用",
            )
        return

    try:
        key = f"jwt:revoked:{jti}"
        if await redis_client.get(key):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="认证令牌已失效",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("JWT blacklist check failed: %s", exc)
        if settings.jwt_blacklist_fail_closed:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="认证校验失败",
            )


async def revoke_token(token: str) -> None:
    if not settings.jwt_blacklist_enabled:
        return
    try:
        payload = decode_token(token)
    except HTTPException:
        return
    jti = payload.get("jti")
    if not jti:
        return
    exp = payload.get("exp")
    if not exp:
        return
    ttl = int(exp - time.time())
    if ttl <= 0:
        return
    if not redis_client:
        return
    try:
        key = f"jwt:revoked:{jti}"
        await redis_client.set(key, "1", ex=ttl)
    except Exception as exc:
        logger.warning("JWT revoke failed: %s", exc)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """获取当前登录用户"""
    token = get_token_from_request(credentials, request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证信息",
        )
    payload = decode_token(token)
    await _ensure_token_not_revoked(payload)
    user_id = payload.get("sub")
    
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌",
        )
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用",
        )
    
    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(optional_security),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """获取当前用户（可选，支持 JWT 或 API Key）"""
    token = get_token_from_request(credentials, request)
    if token:
        try:
            payload = decode_token(token)
            await _ensure_token_not_revoked(payload)
            user_id = payload.get("sub")
            if not user_id:
                return None
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user or not user.is_active:
                return None
            return user
        except Exception:
            return None

    if x_api_key and x_api_key.strip():
        try:
            return await _get_user_from_api_key(x_api_key, request, db)
        except HTTPException:
            return None

    return None


async def _get_user_from_api_key(
    api_key: str,
    request: Optional[Request],
    db: AsyncSession,
) -> User:
    api_key = api_key.strip()
    if len(api_key) < settings.api_key_user_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API Key 格式无效",
        )

    api_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    api_email = f"api_{api_hash}@api.local"

    result = await db.execute(select(User).where(User.email == api_email))
    user = result.scalar_one_or_none()

    if not user:
        if not settings.api_key_user_creation_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API Key 用户创建未启用，请先登录",
            )

        if request and redis_client:
            ip = request.client.host if request.client else "unknown"
            rate_key = f"api_user_create:{ip}"
            current = await redis_client.get(rate_key)
            if current and int(current) >= settings.api_key_user_creation_limit_per_ip:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="API Key 创建过于频繁，请稍后重试",
                )

            async with redis_client.pipeline() as pipe:
                await pipe.incr(rate_key)
                if not current:
                    await pipe.expire(
                        rate_key, settings.api_key_user_creation_limit_window_seconds
                    )
                await pipe.execute()

        user = User(
            email=api_email,
            password_hash=get_password_hash(secrets.token_urlsafe(32)),
            nickname="API User",
            note="API key user",
            tags=["api_key"],
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用",
        )

    return user


async def get_current_user_or_api_key(
    credentials: HTTPAuthorizationCredentials = Depends(optional_security),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """获取当前用户（支持 JWT 或 API Key）"""
    token = get_token_from_request(credentials, request)
    if token:
        payload = decode_token(token)
        await _ensure_token_not_revoked(payload)
        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的认证令牌",
            )

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="用户已被禁用",
            )

        return user

    if not x_api_key or not x_api_key.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证信息",
        )

    return await _get_user_from_api_key(x_api_key, request, db)


async def get_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """获取管理员用户"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )
    return current_user
