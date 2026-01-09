"""
兑换码模型
"""
import uuid
import secrets
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


def generate_redeem_code() -> str:
    """生成随机兑换码 (16位)"""
    return secrets.token_hex(8).upper()


class RedeemCode(Base):
    """兑换码表"""
    __tablename__ = "redeem_codes"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    code: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, default=generate_redeem_code
    )
    credit_amount: Mapped[int] = mapped_column(Integer)  # 积分数量
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    used_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    batch_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)  # 批次ID
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
