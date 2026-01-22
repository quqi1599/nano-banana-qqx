"""
用户模型
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nickname: Mapped[str] = mapped_column(String(100), nullable=True)
    credit_balance: Mapped[int] = mapped_column(Integer, default=0)  # 通用积分余额
    pro3_balance: Mapped[int] = mapped_column(Integer, default=0)  # Gemini 3 Pro 可用次数
    flash_balance: Mapped[int] = mapped_column(Integer, default=0)  # Gemini 2.5 Flash 可用次数
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    last_login_ip: Mapped[str] = mapped_column(String(45), nullable=True)
    note: Mapped[str] = mapped_column(String(500), nullable=True)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    tickets = relationship("Ticket", back_populates="user", cascade="all, delete-orphan")
    feedbacks = relationship("UserFeedback", foreign_keys="UserFeedback.user_id", back_populates="user")
