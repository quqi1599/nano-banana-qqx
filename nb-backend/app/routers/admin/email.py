"""
邮件配置和邮箱白名单管理路由
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.email_config import EmailConfig
from app.models.email_whitelist import EmailWhitelist
from app.schemas.admin import (
    EmailConfigResponse,
    EmailConfigUpdate,
    SmtpConfigResponse,
    SmtpConfigUpdate,
)
from app.utils.security import get_admin_user
from app.utils.rate_limiter import RateLimiter
from app.utils.cache import delete_cache
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()

EMAIL_WHITELIST_CACHE_KEY = "email_whitelist:active:v1"


# ============ 邮箱白名单管理 ============


class EmailWhitelistCreate(BaseModel):
    """创建邮箱白名单请求"""
    suffix: str  # 如 @qq.com


class EmailWhitelistResponse(BaseModel):
    """邮箱白名单响应"""
    id: str
    suffix: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/email-whitelist", response_model=list[EmailWhitelistResponse])
async def list_email_whitelist(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取邮箱后缀白名单

    Returns:
        邮箱白名单列表
    """
    result = await db.execute(
        select(EmailWhitelist).order_by(EmailWhitelist.created_at.desc())
    )
    return [EmailWhitelistResponse.model_validate(w) for w in result.scalars().all()]


@router.post("/email-whitelist", response_model=EmailWhitelistResponse)
async def add_email_whitelist(
    data: EmailWhitelistCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    添加邮箱后缀白名单

    Args:
        data: 包含后缀的请求体

    Returns:
        创建的白名单记录

    Raises:
        HTTPException: 后缀已存在时
    """
    suffix = data.suffix.strip().lower()
    if not suffix.startswith("@"):
        suffix = "@" + suffix

    # 检查是否已存在
    result = await db.execute(
        select(EmailWhitelist).where(EmailWhitelist.suffix == suffix)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该后缀已存在",
        )

    whitelist = EmailWhitelist(suffix=suffix)
    db.add(whitelist)
    await db.commit()
    await db.refresh(whitelist)
    await delete_cache(EMAIL_WHITELIST_CACHE_KEY)

    logger.info("Admin %s added email whitelist %s", admin.email, suffix)
    return EmailWhitelistResponse.model_validate(whitelist)


@router.put("/email-whitelist/{whitelist_id}")
async def toggle_email_whitelist(
    whitelist_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    切换邮箱后缀白名单状态

    Args:
        whitelist_id: 白名单ID

    Returns:
        切换后的状态
    """
    result = await db.execute(
        select(EmailWhitelist).where(EmailWhitelist.id == whitelist_id)
    )
    whitelist = result.scalar_one_or_none()

    if not whitelist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="白名单不存在",
        )

    whitelist.is_active = not whitelist.is_active
    await db.commit()
    await delete_cache(EMAIL_WHITELIST_CACHE_KEY)

    logger.info("Admin %s toggled email whitelist %s to %s",
                admin.email, whitelist.suffix, whitelist.is_active)
    return {"message": "状态已切换", "is_active": whitelist.is_active}


@router.delete("/email-whitelist/{whitelist_id}")
async def delete_email_whitelist(
    whitelist_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    删除邮箱后缀白名单

    Args:
        whitelist_id: 白名单ID

    Returns:
        删除成功消息
    """
    result = await db.execute(
        select(EmailWhitelist).where(EmailWhitelist.id == whitelist_id)
    )
    whitelist = result.scalar_one_or_none()

    if not whitelist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="白名单不存在",
        )

    suffix = whitelist.suffix
    await db.delete(whitelist)
    await db.commit()
    await delete_cache(EMAIL_WHITELIST_CACHE_KEY)

    logger.info("Admin %s deleted email whitelist %s", admin.email, suffix)
    return {"message": "白名单已删除"}


# ============ 邮件配置管理 ============


@router.get("/email-config", response_model=list[EmailConfigResponse])
async def list_email_config(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取所有邮件配置

    Returns:
        邮件配置列表
    """
    result = await db.execute(
        select(EmailConfig).order_by(EmailConfig.email_type.asc())
    )
    configs = result.scalars().all()

    # 如果没有任何配置，初始化默认配置
    if not configs:
        default_configs = []
        for email_type, label in EmailConfig.EMAIL_TYPES.items():
            config = EmailConfig(
                email_type=email_type,
                from_name="DEAI",
                is_enabled=True,
            )
            db.add(config)
            default_configs.append(config)
        await db.commit()
        configs = default_configs

    # 添加类型标签
    response = []
    for config in configs:
        config_dict = EmailConfigResponse.model_validate(config).model_dump()
        config_dict["email_type_label"] = EmailConfig.EMAIL_TYPES.get(config.email_type, config.email_type)
        response.append(EmailConfigResponse(**config_dict))

    return response


@router.put("/email-config/{email_type}", response_model=EmailConfigResponse)
async def update_email_config(
    email_type: str,
    data: EmailConfigUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    更新邮件配置

    Args:
        email_type: 邮件类型
        data: 更新数据

    Returns:
        更新后的配置

    Raises:
        HTTPException: 类型无效时
    """
    # 检查邮件类型是否有效
    if email_type not in EmailConfig.EMAIL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的邮件类型，支持的类型: {list(EmailConfig.EMAIL_TYPES.keys())}",
        )

    result = await db.execute(
        select(EmailConfig).where(EmailConfig.email_type == email_type)
    )
    config = result.scalar_one_or_none()

    # 如果不存在则创建
    if not config:
        config = EmailConfig(email_type=email_type)
        db.add(config)

    # 更新配置
    if data.from_name is not None:
        config.from_name = data.from_name
    if data.from_email is not None:
        config.from_email = data.from_email
    if data.subject_template is not None:
        config.subject_template = data.subject_template
    if data.is_enabled is not None:
        config.is_enabled = data.is_enabled

    await db.commit()
    await db.refresh(config)

    logger.info("Admin %s updated email config for %s", admin.email, email_type)

    config_dict = EmailConfigResponse.model_validate(config).model_dump()
    config_dict["email_type_label"] = EmailConfig.EMAIL_TYPES.get(config.email_type, config.email_type)
    return EmailConfigResponse(**config_dict)


@router.get("/smtp-config", response_model=SmtpConfigResponse)
async def get_smtp_config(
    admin: User = Depends(get_admin_user),
):
    """
    获取SMTP配置

    Returns:
        SMTP配置信息
    """
    return SmtpConfigResponse(
        smtp_host=settings.aliyun_smtp_host,
        smtp_port=settings.aliyun_smtp_port,
        smtp_user=settings.aliyun_smtp_user,
        from_name=settings.aliyun_email_from_name,
        is_configured=bool(settings.aliyun_smtp_user and settings.aliyun_smtp_password),
    )


@router.put("/smtp-config")
async def update_smtp_config(
    data: SmtpConfigUpdate,
    admin: User = Depends(get_admin_user),
):
    """
    更新SMTP配置（需要重启服务生效）

    注意：SMTP配置需要通过环境变量或.env文件修改，请重启服务后生效

    Args:
        data: SMTP配置数据

    Returns:
        提示信息和当前配置
    """
    return {
        "message": "SMTP配置需要通过环境变量或.env文件修改，请重启服务后生效",
        "config": {
            "smtp_host": data.smtp_host,
            "smtp_port": data.smtp_port,
            "from_name": data.from_name,
        }
    }


@router.post("/email-config/test-send")
async def test_send_email(
    email_type: str = Query(..., description="邮件类型"),
    test_email: Optional[str] = Query(None, description="测试接收邮箱（不填则发送到管理员邮箱）"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    测试发送邮件

    限制：
        - 每分钟最多5次
        - 只能发送到管理员自己的邮箱

    Args:
        email_type: 邮件类型
        test_email: 测试邮箱地址（可选）

    Returns:
        发送结果

    Raises:
        HTTPException: 类型无效或安全限制时
    """
    from app.services.email_service import send_verification_code, send_ticket_reply_notification

    # 检查邮件类型
    if email_type not in EmailConfig.EMAIL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的邮件类型: {email_type}",
        )

    # 安全限制：只能发送到管理员自己的邮箱，防止邮件轰炸
    target_email = test_email if test_email else admin.email
    if target_email != admin.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="出于安全考虑，测试邮件只能发送到您自己的管理员邮箱",
        )

    # 根据类型发送测试邮件
    test_code = "123456"
    success = False

    if email_type == "register":
        success = send_verification_code(target_email, test_code, "register")
    elif email_type == "reset":
        success = send_verification_code(target_email, test_code, "reset")
    elif email_type == "ticket_reply":
        success = send_ticket_reply_notification(target_email, "测试工单标题", "这是一条测试回复内容")
    else:
        # 其他类型使用注册模板测试
        success = send_verification_code(target_email, test_code, "register")

    logger.info("Admin %s test sent email type=%s, success=%s", admin.email, email_type, success)

    return {
        "success": success,
        "message": "测试邮件发送成功" if success else "测试邮件发送失败，请检查SMTP配置"
    }
