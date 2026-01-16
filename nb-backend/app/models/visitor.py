"""
游客（未登录用户）模型
跟踪游客使用的自定义 API 端点
"""
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class Visitor(Base):
    """游客表 - 跟踪未登录用户的使用情况"""
    __tablename__ = "visitors"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True
    )
    visitor_id: Mapped[str] = mapped_column(
        String(36), unique=True, index=True, nullable=False
    )
    # 用户配置的自定义 API 端点
    custom_endpoint: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    # 统计数据
    conversation_count: Mapped[int] = mapped_column(Integer, default=0)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    image_count: Mapped[int] = mapped_column(Integer, default=0)

    first_seen: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
