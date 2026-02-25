"""批量生成任务模型用于存储批量图片生成任务的状态、进度和结果"""
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List

from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class BatchTaskStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    PARTIAL = "partial"
    CANCELLED = "cancelled"
    FAILED = "failed"


class BatchGenerationTask(Base):
    __tablename__ = "batch_generation_tasks"

    id = Column(String(64), primary_key=True, index=True)
    # 修复: user_id 改为 String(36) 匹配 users.id 类型
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    mode = Column(String(20), nullable=False)
    total_count = Column(Integer, nullable=False, default=0)
    completed_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default=BatchTaskStatus.PENDING.value)
    celery_task_id = Column(String(100), nullable=True, index=True)
    config = Column(JSONB, default=dict)
    initial_images = Column(JSONB, default=list)
    results = Column(JSONB, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    estimated_duration = Column(Integer, nullable=True)
    total_credits = Column(Integer, nullable=False, default=0)
    refunded_credits = Column(Integer, nullable=False, default=0)
    cancelled_by = Column(String(20), nullable=True)
    cancel_reason = Column(String(200), nullable=True)
    error_message = Column(Text, nullable=True)
    user = relationship("User", back_populates="batch_tasks")

    __table_args__ = (
        Index('idx_batch_tasks_user_status', 'user_id', 'status'),
        Index('idx_batch_tasks_created', 'created_at'),
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "mode": self.mode,
            "status": self.status,
            "progress": {
                "total": self.total_count,
                "completed": self.completed_count,
                "failed": self.failed_count,
                "percentage": round((self.completed_count + self.failed_count) / self.total_count * 100, 1) if self.total_count > 0 else 0,
            },
            "config": self.config,
            "results": self.results,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "cancelled_at": self.cancelled_at.isoformat() if self.cancelled_at else None,
            "credits": {"total": self.total_credits, "refunded": self.refunded_credits},
            "error": self.error_message,
        }

    def is_active(self) -> bool:
        return self.status in [BatchTaskStatus.PENDING.value, BatchTaskStatus.QUEUED.value, BatchTaskStatus.RUNNING.value]

    def can_cancel(self) -> bool:
        return self.status in [BatchTaskStatus.PENDING.value, BatchTaskStatus.QUEUED.value, BatchTaskStatus.RUNNING.value, BatchTaskStatus.PAUSED.value]
