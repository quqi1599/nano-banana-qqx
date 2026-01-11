"""
Token 池模型
"""
from typing import Optional
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TokenPool(Base):
    """Token 池表 - 存储 NewAPI 的 Token"""
    __tablename__ = "token_pool"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100))  # Token 名称/备注
    api_key: Mapped[str] = mapped_column(Text)  # Encrypted or legacy API key
    api_key_hash: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    api_key_prefix: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    api_key_suffix: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    base_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # 查询额度的中转地址
    remaining_quota: Mapped[float] = mapped_column(
        Numeric(10, 4), default=0
    )  # 剩余额度 (美元)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    cooldown_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_failure_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)  # 优先级，越大越优先
    total_requests: Mapped[int] = mapped_column(Integer, default=0)  # 总请求数
    last_used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    last_checked_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)  # 最后检查余额时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
