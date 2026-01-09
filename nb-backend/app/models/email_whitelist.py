"""
邮箱后缀白名单模型
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class EmailWhitelist(Base):
    """邮箱后缀白名单表"""
    __tablename__ = "email_whitelist"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    suffix: Mapped[str] = mapped_column(String(100), unique=True, index=True)  # 如 @qq.com, @gmail.com
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
