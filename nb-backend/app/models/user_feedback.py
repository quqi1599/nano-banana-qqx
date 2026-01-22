"""
User feedback model.

记录用户反馈信息，包括：
- 反馈类型（bug、feature、其他）
- 反馈内容
- 相关会话/任务ID
- 处理状态
- 管理员回复
"""
import uuid
from datetime import datetime
from typing import Optional, Any

from sqlalchemy import String, DateTime, Integer, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserFeedback(Base):
    """用户反馈表"""

    __tablename__ = "user_feedbacks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), index=True, nullable=True
    )

    # 反馈类型
    feedback_type: Mapped[str] = mapped_column(
        String(32), index=True, default="other"
    )  # bug, feature, improvement, complaint, other

    # 反馈分类
    category: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True
    )  # ui, performance, api, billing, content, etc.

    # 反馈内容
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)

    # 相关信息
    related_conversation_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    related_task_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    related_model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # 环境信息
    page_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    browser_info: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    extra_data: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # 截图/附件
    screenshots: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)

    # 状态
    status: Mapped[str] = mapped_column(
        String(32), index=True, default="pending"
    )  # pending, reviewing, resolved, rejected, closed

    # 优先级
    priority: Mapped[str] = mapped_column(
        String(16), default="normal"
    )  # low, normal, high, urgent

    # 管理员处理
    admin_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # 用户评分（处理完成后）
    user_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 1-5

    # 元数据
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # 关系
    user = relationship("User", foreign_keys="UserFeedback.user_id", back_populates="feedbacks")
    admin = relationship("User", foreign_keys="UserFeedback.admin_id")

    def to_dict(self) -> dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "feedback_type": self.feedback_type,
            "category": self.category,
            "title": self.title,
            "content": self.content,
            "related_conversation_id": self.related_conversation_id,
            "related_task_id": self.related_task_id,
            "related_model": self.related_model,
            "page_url": self.page_url,
            "browser_info": self.browser_info,
            "extra_data": self.extra_data,
            "screenshots": self.screenshots,
            "status": self.status,
            "priority": self.priority,
            "admin_notes": self.admin_notes,
            "admin_id": self.admin_id,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "user_rating": self.user_rating,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
