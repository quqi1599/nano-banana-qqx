"""
使用日志模型
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class UsageLog(Base):
    """使用日志表 - 记录每次 API 调用"""
    __tablename__ = "usage_logs"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )
    model_name: Mapped[str] = mapped_column(String(100), index=True)
    credits_used: Mapped[int] = mapped_column(Integer)
    token_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("token_pool.id"), nullable=True
    )
    request_type: Mapped[str] = mapped_column(String(50))  # generate_image, chat 等
    prompt_preview: Mapped[str] = mapped_column(Text, nullable=True)  # 提示词预览
    is_success: Mapped[bool] = mapped_column(default=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )
