"""
Queue metrics model.

记录队列监控的历史指标数据，用于趋势分析和性能监控
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Integer, Float, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class QueueMetrics(Base):
    """队列指标历史记录表"""

    __tablename__ = "queue_metrics"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # 时间戳
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    # 时间窗口（分钟）
    time_window_minutes: Mapped[int] = mapped_column(Integer, default=5)

    # 队列名称
    queue_name: Mapped[str] = mapped_column(String(64), index=True)

    # 队列长度
    pending_count: Mapped[int] = mapped_column(Integer, default=0)
    active_count: Mapped[int] = mapped_column(Integer, default=0)

    # 任务统计（时间窗口内）
    succeeded_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    revoked_count: Mapped[int] = mapped_column(Integer, default=0)

    # 执行时间统计（秒）
    avg_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    max_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    p95_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    p99_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Worker 统计
    worker_count: Mapped[int] = mapped_column(Integer, default=0)

    # 额外指标
    extra_metrics: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # 索引
    __table_args__ = (
        Index("idx_queue_metrics_recorded_at", "recorded_at"),
        Index("idx_queue_metrics_queue_name", "queue_name"),
    )

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "id": self.id,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
            "time_window_minutes": self.time_window_minutes,
            "queue_name": self.queue_name,
            "pending_count": self.pending_count,
            "active_count": self.active_count,
            "succeeded_count": self.succeeded_count,
            "failed_count": self.failed_count,
            "revoked_count": self.revoked_count,
            "avg_duration": self.avg_duration,
            "min_duration": self.min_duration,
            "max_duration": self.max_duration,
            "p95_duration": self.p95_duration,
            "p99_duration": self.p99_duration,
            "worker_count": self.worker_count,
            "extra_metrics": self.extra_metrics,
        }
