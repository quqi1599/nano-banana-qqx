"""
邮件配置管理 API - 类似 xboard 的邮件配置功能
"""
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.database import get_db
from app.models.smtp_config import SmtpConfig
from app.models.user import User
from app.services.email_service_v2 import (
    send_test_email,
    PRESET_PROVIDERS,
    create_sender,
)
from app.utils.security import get_admin_user
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/email-settings", tags=["email-settings"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ProviderInfo(BaseModel):
    """提供商信息"""
    id: str
    name: str
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    encryption: Optional[str] = None
    api_url: Optional[str] = None


class SmtpConfigCreate(BaseModel):
    """创建 SMTP 配置"""
    name: str = Field(..., description="配置名称", min_length=1, max_length=100)
    provider: str = Field(..., description="提供商类型")
    smtp_host: Optional[str] = Field(None, description="SMTP 服务器地址")
    smtp_port: Optional[int] = Field(None, description="SMTP 端口")
    smtp_encryption: str = Field("ssl", description="加密方式: ssl, tls, none")
    smtp_user: Optional[str] = Field(None, description="SMTP 用户名")
    smtp_password: Optional[str] = Field(None, description="SMTP 密码")
    from_email: Optional[EmailStr] = Field(None, description="发件人邮箱")
    from_name: str = Field("NanoBanana", description="发件人名称")
    reply_to: Optional[EmailStr] = Field(None, description="回复邮箱")
    api_key: Optional[str] = Field(None, description="API 密钥")
    api_url: Optional[str] = Field(None, description="API 端点 URL")
    is_enabled: bool = Field(True, description="是否启用")
    is_default: bool = Field(False, description="是否为默认配置")
    daily_limit: Optional[int] = Field(None, description="每日发送限制")
    hourly_limit: Optional[int] = Field(None, description="每小时发送限制")
    description: Optional[str] = Field(None, description="配置说明")


class SmtpConfigUpdate(BaseModel):
    """更新 SMTP 配置"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    provider: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_encryption: Optional[str] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    from_email: Optional[EmailStr] = None
    from_name: Optional[str] = None
    reply_to: Optional[EmailStr] = None
    api_key: Optional[str] = None
    api_url: Optional[str] = None
    is_enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    daily_limit: Optional[int] = None
    hourly_limit: Optional[int] = None
    description: Optional[str] = None


class SmtpConfigResponse(BaseModel):
    """SMTP 配置响应（不包含敏感信息）"""
    id: str
    name: str
    provider: str
    provider_name: str
    smtp_host: str
    smtp_port: int
    smtp_encryption: str
    smtp_user: Optional[str] = None
    # 注意：不返回 smtp_password 和 api_key，仅表示是否存在
    has_password: bool = False
    has_api_key: bool = False
    from_email: Optional[str] = None
    from_name: str
    reply_to: Optional[str] = None
    api_url: Optional[str] = None
    is_enabled: bool
    is_default: bool
    daily_limit: Optional[int] = None
    hourly_limit: Optional[int] = None
    description: Optional[str] = None
    created_at: str
    updated_at: str


def _map_config_to_response(config: SmtpConfig) -> SmtpConfigResponse:
    """辅助函数：将 SmtpConfig 映射到 SmtpConfigResponse（避免代码重复）"""
    return SmtpConfigResponse(
        id=config.id,
        name=config.name,
        provider=config.provider,
        provider_name=SmtpConfig.PROVIDERS.get(config.provider, config.provider),
        smtp_host=config.smtp_host,
        smtp_port=config.smtp_port,
        smtp_encryption=config.smtp_encryption,
        smtp_user=config.smtp_user,
        has_password=bool(config.smtp_password),
        has_api_key=bool(config.api_key),
        from_email=config.from_email,
        from_name=config.from_name,
        reply_to=config.reply_to,
        api_url=config.api_url,
        is_enabled=config.is_enabled,
        is_default=config.is_default,
        daily_limit=config.daily_limit,
        hourly_limit=config.hourly_limit,
        description=config.description,
        created_at=config.created_at.isoformat(),
        updated_at=config.updated_at.isoformat(),
    )


class TestEmailRequest(BaseModel):
    """测试邮件请求"""
    config_id: Optional[str] = Field(None, description="配置 ID，留空则使用默认配置")
    test_email: EmailStr = Field(..., description="测试接收邮箱")


class EmailSettingsSummary(BaseModel):
    """邮件配置概要"""
    total_configs: int
    enabled_configs: int
    default_config: Optional[SmtpConfigResponse] = None
    providers: List[ProviderInfo]


# ============================================================================
# API Endpoints
# ============================================================================


@router.get("/providers", response_model=List[ProviderInfo])
async def get_providers():
    """获取所有支持的邮件提供商"""
    return [
        ProviderInfo(
            id=k,
            name=v["name"],
            smtp_host=v.get("smtp_host"),
            smtp_port=v.get("smtp_port"),
            encryption=v.get("encryption"),
            api_url=v.get("api_url"),
        )
        for k, v in PRESET_PROVIDERS.items()
    ]


@router.get("/configs", response_model=List[SmtpConfigResponse])
async def list_configs(
    enabled_only: bool = Query(False, description="仅显示启用的配置"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取所有邮件配置列表"""
    query = select(SmtpConfig).order_by(desc(SmtpConfig.is_default), SmtpConfig.created_at)

    if enabled_only:
        query = query.where(SmtpConfig.is_enabled == True)

    result = await db.execute(query)
    configs = result.scalars().all()

    return [_map_config_to_response(config) for config in configs]


@router.get("/configs/summary", response_model=EmailSettingsSummary)
async def get_settings_summary(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取邮件配置概要"""
    result = await db.execute(
        select(SmtpConfig).order_by(desc(SmtpConfig.is_default), SmtpConfig.created_at)
    )
    configs = result.scalars().all()

    enabled_configs = [c for c in configs if c.is_enabled]
    default_config = next((c for c in configs if c.is_default), None)
    default_response = _map_config_to_response(default_config) if default_config else None

    providers = [
        ProviderInfo(
            id=k,
            name=v["name"],
            smtp_host=v.get("smtp_host"),
            smtp_port=v.get("smtp_port"),
            encryption=v.get("encryption"),
            api_url=v.get("api_url"),
        )
        for k, v in PRESET_PROVIDERS.items()
    ]

    return EmailSettingsSummary(
        total_configs=len(configs),
        enabled_configs=len(enabled_configs),
        default_config=default_response,
        providers=providers,
    )


@router.get("/configs/{config_id}", response_model=SmtpConfigResponse)
async def get_config(
    config_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取单个邮件配置详情"""
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == config_id))
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    return _map_config_to_response(config)


@router.post("/configs", response_model=SmtpConfigResponse)
async def create_config(
    data: SmtpConfigCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """创建新的邮件配置"""
    # 应用预设配置
    preset = PRESET_PROVIDERS.get(data.provider)
    if preset:
        smtp_host = data.smtp_host or preset.get("smtp_host", "")
        smtp_port = data.smtp_port or preset.get("smtp_port", 465)
        smtp_encryption = data.smtp_encryption or preset.get("encryption", "ssl")
    else:
        smtp_host = data.smtp_host or ""
        smtp_port = data.smtp_port or 465
        smtp_encryption = data.smtp_encryption

    # 如果设置为默认，取消其他配置的默认状态
    if data.is_default:
        result = await db.execute(select(SmtpConfig).where(SmtpConfig.is_default == True))
        for config in result.scalars().all():
            config.is_default = False

    config = SmtpConfig(
        name=data.name,
        provider=data.provider,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_encryption=smtp_encryption,
        smtp_user=data.smtp_user,
        smtp_password=data.smtp_password,
        from_email=data.from_email,
        from_name=data.from_name,
        reply_to=data.reply_to,
        api_key=data.api_key,
        api_url=data.api_url,
        is_enabled=data.is_enabled,
        is_default=data.is_default,
        daily_limit=data.daily_limit,
        hourly_limit=data.hourly_limit,
        description=data.description,
    )

    db.add(config)
    await db.flush()  # 确保数据写入但不提交事务
    await db.refresh(config)

    logger.info("Created email config: %s (provider=%s)", config.id, config.provider)

    return _map_config_to_response(config)


@router.put("/configs/{config_id}", response_model=SmtpConfigResponse)
async def update_config(
    config_id: str,
    data: SmtpConfigUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新邮件配置"""
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == config_id))
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    # 如果设置为默认，取消其他配置的默认状态
    if data.is_default is True and not config.is_default:
        other_result = await db.execute(select(SmtpConfig).where(SmtpConfig.is_default == True))
        for other_config in other_result.scalars().all():
            other_config.is_default = False

    # 更新字段
    if data.name is not None:
        config.name = data.name
    if data.provider is not None:
        config.provider = data.provider
    if data.smtp_host is not None:
        config.smtp_host = data.smtp_host
    if data.smtp_port is not None:
        config.smtp_port = data.smtp_port
    if data.smtp_encryption is not None:
        config.smtp_encryption = data.smtp_encryption
    if data.smtp_user is not None:
        config.smtp_user = data.smtp_user
    if data.smtp_password is not None:
        config.smtp_password = data.smtp_password
    if data.from_email is not None:
        config.from_email = data.from_email
    if data.from_name is not None:
        config.from_name = data.from_name
    if data.reply_to is not None:
        config.reply_to = data.reply_to
    if data.api_key is not None:
        config.api_key = data.api_key
    if data.api_url is not None:
        config.api_url = data.api_url
    if data.is_enabled is not None:
        config.is_enabled = data.is_enabled
    if data.is_default is not None:
        config.is_default = data.is_default
    if data.daily_limit is not None:
        config.daily_limit = data.daily_limit
    if data.hourly_limit is not None:
        config.hourly_limit = data.hourly_limit
    if data.description is not None:
        config.description = data.description

    await db.flush()  # 确保数据写入但不提交事务
    await db.refresh(config)

    logger.info("Updated email config: %s", config.id)

    return _map_config_to_response(config)


@router.delete("/configs/{config_id}")
async def delete_config(
    config_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """删除邮件配置"""
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == config_id))
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    await db.delete(config)
    await db.commit()

    logger.info("Deleted email config: %s", config_id)

    return {"message": "配置已删除"}


@router.post("/configs/{config_id}/set-default")
async def set_default_config(
    config_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """设置默认邮件配置"""
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == config_id))
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    # 取消其他配置的默认状态
    other_result = await db.execute(select(SmtpConfig).where(SmtpConfig.is_default == True))
    for other_config in other_result.scalars().all():
        other_config.is_default = False

    config.is_default = True
    await db.commit()

    logger.info("Set default email config: %s", config_id)

    return {"message": "已设置为默认配置"}


@router.post("/configs/{config_id}/toggle")
async def toggle_config(
    config_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """切换邮件配置启用状态"""
    result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == config_id))
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")

    config.is_enabled = not config.is_enabled
    await db.commit()

    logger.info("Toggled email config %s: is_enabled=%s", config_id, config.is_enabled)

    return {
        "message": f"配置已{'启用' if config.is_enabled else '禁用'}",
        "is_enabled": config.is_enabled,
    }


@router.post("/test-send")
async def test_send(
    data: TestEmailRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """发送测试邮件，返回详细诊断信息"""
    config = None

    if data.config_id:
        result = await db.execute(select(SmtpConfig).where(SmtpConfig.id == data.config_id))
        config = result.scalar_one_or_none()

        if not config:
            raise HTTPException(status_code=404, detail="配置不存在")
    else:
        result = await db.execute(
            select(SmtpConfig)
            .where(SmtpConfig.is_enabled == True)
            .order_by(desc(SmtpConfig.is_default))
        )
        config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=400, detail="没有可用的邮件配置")

    # 构建配置字典
    config_dict = {
        "provider": config.provider,
        "name": config.name,
        "smtp_host": config.smtp_host,
        "smtp_port": config.smtp_port,
        "smtp_encryption": config.smtp_encryption,
        "smtp_user": config.smtp_user,
        "smtp_password": config.smtp_password,
        "from_email": config.from_email or config.smtp_user,
        "from_name": config.from_name,
        "reply_to": config.reply_to,
        "api_key": config.api_key,
        "api_url": config.api_url,
        "domain": config.api_url,  # For Mailgun
    }

    sender = create_sender(config_dict)
    provider_name = SmtpConfig.PROVIDERS.get(config.provider, config.provider)

    # 构建测试邮件 HTML
    from datetime import datetime
    send_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 导入邮件模板函数
    from app.services.email_service import (
        _header, _content, _footer, _email_wrapper, _container
    )

    content = _header("📧", "邮件配置测试", f"测试 {provider_name} 邮件服务", "#10b981")
    content += _content(f"""
<p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #6b7280; margin-bottom: 16px;">
    如果您收到这封邮件，说明 <strong>{provider_name}</strong> 邮件服务配置成功！
</p>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td style="background-color: #ecfdf5; border-left: 4px solid #10b981; border-radius: 0 12px 12px 0; padding: 20px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; font-weight: 600; color: #065f46; margin-bottom: 8px;">配置信息</p>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #047857;">
                提供商: {provider_name}<br>
                收件人: {data.test_email}<br>
                发送时间: {send_time}
            </p>
        </td>
    </tr>
</table>
""")
    content += _footer("这是一封测试邮件，请勿回复")

    html = _email_wrapper(_container(content))

    # 发送并获取详细结果
    result = sender.send(data.test_email, f"【NanoBanana】邮件配置测试 - {provider_name}", html)

    logger.info("Test email sent: success=%s, error_type=%s", result.get("success"), result.get("error_type"))

    return result
