from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.database import Base

class Ticket(Base):
    """工单模型"""
    __tablename__ = "tickets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)

    # open, pending, resolved, closed
    status = Column(String(20), default="open")

    # low, normal, high
    priority = Column(String(20), default="normal")

    # bug, feature, billing, account, technical, other
    category = Column(String(20), default="other")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关联
    user = relationship("User", back_populates="tickets")
    messages = relationship("TicketMessage", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketMessage.created_at")

class TicketMessage(Base):
    """工单消息模型"""
    __tablename__ = "ticket_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id = Column(String(36), ForeignKey("tickets.id"), nullable=False)
    sender_id = Column(String(36), ForeignKey("users.id"), nullable=False)

    content = Column(Text, nullable=False)
    is_admin = Column(Boolean, default=False)  # 是否为管理员回复 (冗余字段方便查询)
    is_read = Column(Boolean, default=False)  # 是否已读 (用户端: 管理员回复是否已读; 管理员端: 用户回复是否已读)

    created_at = Column(DateTime, default=datetime.utcnow)

    # 关联
    ticket = relationship("Ticket", back_populates="messages")
    sender = relationship("User")
