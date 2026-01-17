"""
对话历史模型
"""
from typing import Optional
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Boolean, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.utils.timezone import utc_now_naive


class Conversation(Base):
    """
    对话表

    分组逻辑：
    - 登录用户：按 user_id 分组
    - 未登录 + 默认URL：归入"淘宝用户"组
    - 未登录 + 自定义URL/API：按 api_key_prefix 分组
    """
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True
    )
    visitor_id: Mapped[Optional[str]] = mapped_column(String(36), index=True, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    model_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    custom_endpoint: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # API Key 前缀（脱敏显示，如 sk-***abc），用于未登录用户的对话分组
    api_key_prefix: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    # 完整 API Key（可加密存储），仅管理员用于排查
    api_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now_naive
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utc_now_naive,
        onupdate=utc_now_naive
    )

    # 关系
    messages = relationship(
        "ConversationMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ConversationMessage.created_at"
    )


class ConversationMessage(Base):
    """对话消息表"""
    __tablename__ = "conversation_messages"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user / assistant / system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    images: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string of images array
    is_thought: Mapped[bool] = mapped_column(Boolean, default=False)
    thinking_duration: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now_naive
    )

    # 关系
    conversation = relationship("Conversation", back_populates="messages")
