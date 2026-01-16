"""
SMTP 邮件配置模型 - 支持多个邮件提供商
"""
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class SmtpConfig(Base):
    """SMTP 邮件配置表 - 支持多个邮件提供商配置"""
    __tablename__ = "smtp_config"

    # 邮件提供商类型
    PROVIDERS = {
        "aliyun": "阿里云邮件推送",
        "tencent": "腾讯云邮件推送",
        "smtp": "通用 SMTP",
        "sendgrid": "SendGrid",
        "mailgun": "Mailgun",
        "ses": "Amazon SES",
        "custom": "自定义",
    }

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(
        String(100), default="默认配置"
    )  # 配置名称（如"阿里云主邮箱"、"腾讯云备用"）
    provider: Mapped[str] = mapped_column(
        String(50), default="smtp"
    )  # 提供商类型

    # SMTP 基础配置
    smtp_host: Mapped[str] = mapped_column(
        String(200), default="smtpdm.aliyun.com"
    )  # SMTP 服务器地址
    smtp_port: Mapped[int] = mapped_column(
        Integer, default=465
    )  # SMTP 端口
    smtp_encryption: Mapped[str] = mapped_column(
        String(20), default="ssl"
    )  # 加密方式: ssl, tls, none

    # 认证信息
    smtp_user: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )  # SMTP 用户名
    smtp_password: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )  # SMTP 密码（加密存储）

    # 发件人信息
    from_email: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )  # 发件人邮箱
    from_name: Mapped[str] = mapped_column(
        String(100), default="NanoBanana"
    )  # 发件人名称
    reply_to: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )  # 回复邮箱

    # API 相关配置（用于 SendGrid, Mailgun, SES 等）
    api_key: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )  # API 密钥
    api_url: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )  # API 端点 URL

    # 状态配置
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True
    )  # 是否启用
    is_default: Mapped[bool] = mapped_column(
        Boolean, default=False
    )  # 是否为默认配置

    # 限流配置
    daily_limit: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )  # 每日发送限制
    hourly_limit: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )  # 每小时发送限制

    # 备注
    description: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # 配置说明

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self):
        return f"<SmtpConfig(id={self.id}, name={self.name}, provider={self.provider}, is_enabled={self.is_enabled})>"
