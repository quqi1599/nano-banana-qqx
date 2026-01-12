"""
对话清理记录模型
"""
from typing import Optional
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ConversationCleanup(Base):
    """对话清理记录表"""
    __tablename__ = "conversation_cleanups"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), index=True, comment="用户ID")
    user_email: Mapped[str] = mapped_column(String(255), comment="用户邮箱（快照）")
    user_nickname: Mapped[Optional[str]] = mapped_column(String(100), comment="用户昵称（快照）")
    conversation_id: Mapped[str] = mapped_column(String(36), comment="对话ID")
    conversation_title: Mapped[Optional[str]] = mapped_column(String(200), comment="对话标题")
    message_count: Mapped[int] = mapped_column(Integer, comment="消息数量")
    conversation_created_at: Mapped[datetime] = mapped_column(DateTime, comment="对话创建时间")
    conversation_updated_at: Mapped[datetime] = mapped_column(DateTime, comment="对话更新时间")
    cleanup_reason: Mapped[str] = mapped_column(String(50), default="auto_14days", comment="清理原因: auto_14days, manual, user_delete")
    cleaned_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now(timezone.utc), comment="清理时间（UTC）"
    )
