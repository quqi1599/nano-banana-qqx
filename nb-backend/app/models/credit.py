"""
积分交易模型
"""
import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TransactionType(str, Enum):
    """交易类型"""
    RECHARGE = "recharge"      # 充值
    CONSUME = "consume"        # 消费
    REDEEM = "redeem"          # 兑换码兑换
    BONUS = "bonus"            # 赠送
    REFUND = "refund"          # 退款


class CreditTransaction(Base):
    """积分交易记录表"""
    __tablename__ = "credit_transactions"
    
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )
    amount: Mapped[int] = mapped_column(Integer)  # 正数增加，负数减少
    type: Mapped[str] = mapped_column(String(20))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    balance_after: Mapped[int] = mapped_column(Integer)  # 交易后余额
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )
