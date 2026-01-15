"""
套餐模型 - 定义可购买的积分套餐
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class PaymentPlan(Base):
    """支付套餐表"""
    __tablename__ = "payment_plans"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100))  # 套餐名称
    description: Mapped[str] = mapped_column(String(500), nullable=True)  # 描述
    credits: Mapped[int] = mapped_column(Integer)  # 获得积分数
    price_usd: Mapped[float] = mapped_column(Numeric(10, 2))  # 价格（USD）
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # 是否启用
    sort_order: Mapped[int] = mapped_column(Integer, default=0)  # 排序
    is_popular: Mapped[bool] = mapped_column(Boolean, default=False)  # 是否热门
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self):
        return f"<PaymentPlan {self.name}: {self.price_usd} USD = {self.credits} credits>"
