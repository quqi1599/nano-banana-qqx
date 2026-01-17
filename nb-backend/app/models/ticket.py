from typing import Optional
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.database import Base
import uuid


class Ticket(Base):
    """工单模型"""
    __tablename__ = "tickets"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)

    # open, pending, resolved, closed
    status: Mapped[str] = mapped_column(String(20), default="open")

    # low, normal, high
    priority: Mapped[str] = mapped_column(String(20), default="normal")

    # bug, feature, billing, account, technical, other
    category: Mapped[str] = mapped_column(String(20), default="other")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # 管理员最后回复时间（用于自动关闭：超过3天用户未回复则自动关闭）
    last_admin_reply_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )

    # 关联
    user = relationship("User", back_populates="tickets")
    messages = relationship(
        "TicketMessage",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketMessage.created_at",
    )


class TicketMessage(Base):
    """工单消息模型"""
    __tablename__ = "ticket_messages"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    ticket_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tickets.id"), nullable=False
    )
    sender_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_admin: Mapped[bool] = mapped_column(
        Boolean, default=False
    )  # 是否为管理员回复 (冗余字段方便查询)
    is_read: Mapped[bool] = mapped_column(
        Boolean, default=False
    )  # 是否已读 (用户端: 管理员回复是否已读; 管理员端: 用户回复是否已读)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # 关联
    ticket = relationship("Ticket", back_populates="messages")
    sender = relationship("User")
