"""
支付订单模型
"""
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Boolean, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class PaymentOrder(Base):
    """支付订单表"""
    __tablename__ = "payment_orders"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    trade_no: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # 交易订单号
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("payment_plans.id"))
    amount: Mapped[float] = mapped_column(Numeric(10, 2))  # 订单金额（USD）
    credits: Mapped[int] = mapped_column(Integer)  # 获得积分数
    payment_method: Mapped[str] = mapped_column(String(32))  # 支付方式: usdt_trc20, usdt_erc20
    status: Mapped[str] = mapped_column(
        String(32), default="pending"
    )  # pending, processing, paid, cancelled, expired, failed

    # USDT 相关字段
    wallet_address: Mapped[str] = mapped_column(String(64), nullable=True)  # 收款地址
    expected_amount: Mapped[float] = mapped_column(Numeric(18, 8), nullable=True)  # 期望USDT数量
    received_amount: Mapped[float] = mapped_column(Numeric(18, 8), nullable=True)  # 实际收到USDT
    network: Mapped[str] = mapped_column(String(16), nullable=True)  # TRC20, ERC20, BEP20
    tx_hash: Mapped[str] = mapped_column(String(128), nullable=True)  # 区块链交易哈希
    confirmations: Mapped[int] = mapped_column(Integer, default=0)  # 确认数

    # 时间字段
    paid_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)  # 支付时间
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)  # 过期时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # 关系
    user = relationship("User", backref="orders")
    plan = relationship("PaymentPlan")

    def __repr__(self):
        return f"<PaymentOrder {self.trade_no}: {self.status}>"


class UsdtPaymentRecord(Base):
    """USDT支付记录表 - 详细记录每笔区块链交易"""
    __tablename__ = "usdt_payment_records"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    order_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("payment_orders.id"), index=True
    )
    from_address: Mapped[str] = mapped_column(String(64), nullable=True)  # 付款地址
    to_address: Mapped[str] = mapped_column(String(64))  # 收款地址
    amount: Mapped[float] = mapped_column(Numeric(18, 8))  # 支付金额（USDT）
    network: Mapped[str] = mapped_column(String(16))  # TRC20, ERC20, BEP20
    tx_hash: Mapped[str] = mapped_column(String(128), unique=True)  # 交易哈希
    block_number: Mapped[int] = mapped_column(Integer, nullable=True)  # 区块号
    confirmations: Mapped[int] = mapped_column(Integer, default=0)  # 确认数
    status: Mapped[str] = mapped_column(
        String(32), default="pending"
    )  # pending, confirmed, verified, failed
    verified_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)  # 验证时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    # 关系
    order = relationship("PaymentOrder", backref="usdt_records")

    def __repr__(self):
        return f"<UsdtPaymentRecord {self.tx_hash}: {self.amount} USDT>"
