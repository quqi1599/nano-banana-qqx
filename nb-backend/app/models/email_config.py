"""
邮件配置模型 - 存储不同类型邮件的发件人配置
"""
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class EmailConfig(Base):
    """邮件配置表 - 支持不同类型邮件的发件人和模板配置"""
    __tablename__ = "email_config"

    # 邮件类型: register(注册验证码), reset(密码重置), ticket_reply(工单回复), ticket_new(新工单通知), ticket_user_reply(用户回复工单)
    EMAIL_TYPES = {
        "register": "注册验证码",
        "reset": "密码重置",
        "ticket_reply": "工单回复通知",
        "ticket_new": "新工单通知",
        "ticket_user_reply": "用户回复工单",
        "welcome": "欢迎邮件",
    }

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email_type: Mapped[str] = mapped_column(
        String(50), unique=True, index=True
    )  # 邮件类型
    from_name: Mapped[str] = mapped_column(
        String(100), default="DEAI"
    )  # 发件人名称
    from_email: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )  # 发件人邮箱（留空则使用默认SMTP配置）
    subject_template: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )  # 邮件主题模板
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
