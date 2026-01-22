"""
Queue alert model.

记录队列告警信息
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Integer, Text, Boolean, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class QueueAlert(Base):
    """队列告警表"""

    __tablename__ = "queue_alerts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # 告警类型
    alert_type: Mapped[str] = mapped_column(String(64), index=True)
    # alert_type 类型:
    # - queue_backlog: 队列积压
    # - high_failure_rate: 高失败率
    # - worker_offline: Worker离线
    # - long_running_task: 长时间运行任务
    # - task_stuck: 任务卡住
    # - redis_connection_failed: Redis连接失败
    # - memory_usage_high: 内存使用过高

    # 队列名称
    queue_name: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    # 严重级别
    severity: Mapped[str] = mapped_column(String(16), index=True, default="warning")
    # severity: info, warning, critical

    # 告警状态
    status: Mapped[str] = mapped_column(String(32), index=True, default="firing")
    # status: firing, resolved, acknowledged

    # 告警详情
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)

    # 当前值和阈值
    current_value: Mapped[Optional[float]] = mapped_column(Integer, nullable=True)
    threshold_value: Mapped[Optional[float]] = mapped_column(Integer, nullable=True)

    # 额外信息
    extra_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # 通知状态
    notification_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # 处理信息
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 时间戳
    fired_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # 索引
    __table_args__ = (
        Index("idx_queue_alerts_fired_at", "fired_at"),
        Index("idx_queue_alerts_status", "status"),
        Index("idx_queue_alerts_severity", "severity"),
    )

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "id": self.id,
            "alert_type": self.alert_type,
            "queue_name": self.queue_name,
            "severity": self.severity,
            "status": self.status,
            "title": self.title,
            "message": self.message,
            "current_value": self.current_value,
            "threshold_value": self.threshold_value,
            "extra_data": self.extra_data,
            "notification_sent": self.notification_sent,
            "notification_sent_at": self.notification_sent_at.isoformat() if self.notification_sent_at else None,
            "acknowledged_by": self.acknowledged_by,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "notes": self.notes,
            "fired_at": self.fired_at.isoformat() if self.fired_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }
