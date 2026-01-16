"""
管理员初始化和二次确认路由
"""
import hashlib
import json
import logging
import secrets
import time
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.schemas.admin import AdminActionConfirmRequest, AdminActionConfirmResponse
from app.utils.security import get_admin_user, get_current_user, verify_password
from app.utils.redis_client import redis_client
from app.config import get_settings
from app.models.admin_audit_log import AdminAuditLog

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()

ADMIN_CONFIRM_KEY_PREFIX = "admin:confirm:"
ADMIN_CONFIRM_PURPOSES = {"batch_status", "batch_credits"}


def _record_admin_audit(
    db: AsyncSession,
    admin: User,
    action: str,
    target_type: str,
    target_ids: Optional[list[str]],
    reason: Optional[str],
    status_text: str,
    request: Request,
    details: Optional[dict[str, Any]] = None,
) -> None:
    """
    记录管理员审计日志

    Args:
        db: 数据库会话
        admin: 管理员用户
        action: 操作类型
        target_type: 目标类型
        target_ids: 目标ID列表
        reason: 操作原因
        status_text: 状态文本
        request: 请求对象
        details: 额外详情
    """
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    audit = AdminAuditLog(
        admin_id=admin.id,
        action=action,
        target_type=target_type,
        target_ids=target_ids,
        target_count=len(target_ids or []),
        reason=reason,
        status=status_text,
        ip_address=ip,
        user_agent=user_agent,
        details=details,
    )
    db.add(audit)


async def _verify_admin_confirm_token(
    admin: User,
    purpose: str,
    token: str,
    request: Request,
) -> None:
    """
    验证管理员二次确认令牌

    Args:
        admin: 管理员用户
        purpose: 确认目的
        token: 确认令牌
        request: 请求对象

    Raises:
        HTTPException: 验证失败时
    """
    if purpose not in ADMIN_CONFIRM_PURPOSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不支持的确认类型",
        )

    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要二次确认令牌",
        )

    if not redis_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="确认服务不可用",
        )

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    key = f"{ADMIN_CONFIRM_KEY_PREFIX}{admin.id}:{purpose}:{token_hash}"
    raw = await redis_client.get(key)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="二次确认已过期或无效",
        )

    try:
        payload = json.loads(raw)
    except Exception:
        payload = {}

    ip = request.client.host if request.client else None
    if payload.get("ip") and ip and payload.get("ip") != ip:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="二次确认令牌无效",
        )

    await redis_client.delete(key)


@router.post("/init-admin")
async def init_first_admin(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    将当前用户设置为管理员

    要求：
        1. 用户邮箱必须在配置的管理员邮箱列表中 (admin_emails)
        2. 数据库中尚未有管理员（首次初始化）

    Headers:
        X-Admin-Init-Token: 生产环境必需的初始化令牌

    Returns:
        包含用户信息和管理员状态的响应
    """
    # 生产环境要求初始化令牌
    if settings.is_production() and not settings.admin_init_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="生产环境禁止无初始化令牌的管理员创建",
        )

    if settings.admin_init_token:
        init_token = request.headers.get("X-Admin-Init-Token", "")
        if init_token != settings.admin_init_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="初始化令牌无效",
            )

    allowed_emails = settings.admin_emails_list
    if not allowed_emails:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="系统未配置管理员邮箱白名单，请联系系统管理员",
        )

    # 检查当前用户邮箱是否在白名单中
    if current_user.email.lower() not in allowed_emails:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"您的邮箱无权成为管理员。如有疑问，请联系系统管理员。",
        )

    # 检查是否已有管理员
    admin_result = await db.execute(select(User).where(User.is_admin == True))
    existing_admin = admin_result.scalar_one_or_none()

    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"管理员已存在 ({existing_admin.email})，无法初始化",
        )

    # 将当前用户设为管理员
    current_user.is_admin = True
    _record_admin_audit(
        db=db,
        admin=current_user,
        action="init_admin",
        target_type="user",
        target_ids=[current_user.id],
        reason=None,
        status_text="success",
        request=request,
        details={"initialized": True},
    )
    await db.commit()

    logger.info(f"用户 {current_user.email} 已初始化为管理员")
    return {
        "message": "已设置为管理员",
        "email": current_user.email,
        "is_admin": True
    }


@router.post("/confirm-action", response_model=AdminActionConfirmResponse)
async def confirm_admin_action(
    request: Request,
    data: AdminActionConfirmRequest,
    admin: User = Depends(get_admin_user),
):
    """
    管理员敏感操作二次确认

    用于批量操作前的密码验证，生成临时确认令牌。

    Args:
        data: 包含操作目的和密码的请求体
        admin: 当前管理员用户

    Returns:
        包含确认令牌和过期时间的响应

    Raises:
        HTTPException: 密码错误或服务不可用时
    """
    if data.purpose not in ADMIN_CONFIRM_PURPOSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不支持的确认类型",
        )

    if not verify_password(data.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="管理员密码错误",
        )

    if not redis_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="确认服务不可用",
        )

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    key = f"{ADMIN_CONFIRM_KEY_PREFIX}{admin.id}:{data.purpose}:{token_hash}"
    payload = {
        "ip": request.client.host if request and request.client else None,
        "ua": request.headers.get("user-agent") if request else None,
        "ts": int(time.time()),
    }
    ttl = max(30, int(settings.admin_action_confirm_ttl_seconds))
    await redis_client.set(key, json.dumps(payload), ex=ttl)

    return AdminActionConfirmResponse(confirm_token=token, expires_in=ttl)


# Export utilities for other modules
__all__ = ["router", "_record_admin_audit", "_verify_admin_confirm_token"]
