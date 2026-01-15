"""
支付系统相关 Schemas
"""
from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, Literal
from enum import Enum


class PaymentMethod(str, Enum):
    """支付方式"""
    USDT_TRC20 = "usdt_trc20"
    USDT_ERC20 = "usdt_erc20"
    USDT_BEP20 = "usdt_bep20"


class OrderStatus(str, Enum):
    """订单状态"""
    PENDING = "pending"  # 待支付
    PROCESSING = "processing"  # 支付处理中
    PAID = "paid"  # 已支付
    CANCELLED = "cancelled"  # 已取消
    EXPIRED = "expired"  # 已过期
    FAILED = "failed"  # 支付失败


# ========== 套餐相关 ==========

class PaymentPlanCreate(BaseModel):
    """创建套餐请求（管理员）"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    credits: int = Field(..., gt=0)
    price_usd: float = Field(..., gt=0)
    sort_order: int = 0
    is_active: bool = True
    is_popular: bool = False


class PaymentPlanUpdate(BaseModel):
    """更新套餐请求（管理员）"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    credits: Optional[int] = Field(None, gt=0)
    price_usd: Optional[float] = Field(None, gt=0)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_popular: Optional[bool] = None


class PaymentPlanResponse(BaseModel):
    """套餐响应"""
    id: str
    name: str
    description: Optional[str]
    credits: int
    price_usd: float
    is_active: bool
    sort_order: int
    is_popular: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ========== 订单相关 ==========

class CreateOrderRequest(BaseModel):
    """创建订单请求"""
    plan_id: str
    payment_method: PaymentMethod

    @validator('payment_method')
    def validate_payment_method(cls, v):
        if v not in PaymentMethod:
            raise ValueError('不支持的支付方式')
        return v


class OrderResponse(BaseModel):
    """订单响应"""
    id: str
    trade_no: str
    plan_id: str
    amount: float
    credits: int
    payment_method: str
    status: OrderStatus
    redeem_code: Optional[str]
    wallet_address: Optional[str]
    expected_amount: Optional[float]
    network: Optional[str]
    paid_at: Optional[datetime]
    expires_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class OrderDetailResponse(OrderResponse):
    """订单详情响应"""
    plan: Optional[PaymentPlanResponse]
    tx_hash: Optional[str]
    confirmations: int
    received_amount: Optional[float]

    class Config:
        from_attributes = True


# ========== USDT 支付相关 ==========

class UsdtPaymentInfo(BaseModel):
    """USDT 支付信息"""
    wallet_address: str  # 收款地址
    network: str  # TRC20, ERC20, BEP20
    expected_amount: float  # 期望 USDT 数量
    qr_code_url: Optional[str]  # 二维码 URL（可选）
    exchange_rate: float  # 汇率（USD -> USDT）
    expires_at: datetime  # 过期时间


class UsdtCallbackRequest(BaseModel):
    """USDT 支付回调请求"""
    trade_no: str  # 订单号
    tx_hash: str  # 交易哈希
    from_address: str  # 付款地址
    to_address: str  # 收款地址
    amount: float  # 实际支付金额
    network: str  # 网络
    block_number: Optional[int] = None  # 区块号
    confirmations: int = 0  # 确认数

    # 签名验证
    signature: str  # HMAC 签名
    timestamp: int  # 时间戳


class UsdtCallbackResponse(BaseModel):
    """USDT 支付回调响应"""
    success: bool
    message: str
    order_status: Optional[str] = None


# ========== 汇率相关 ==========

class ExchangeRateResponse(BaseModel):
    """汇率响应"""
    usdt_usd: float  # USDT 对 USD 汇率（通常接近 1:1）
    updated_at: datetime


# ========== 统计相关 ==========

class PaymentStatsResponse(BaseModel):
    """支付统计响应（管理员）"""
    total_orders: int
    pending_orders: int
    paid_orders: int
    total_revenue: float  # 总收入（USD）
    today_revenue: float  # 今日收入
    usdt_revenue: float  # USDT 收入


class PaymentMethodConfig(BaseModel):
    """支付方式配置"""
    method: PaymentMethod
    name: str
    icon: Optional[str]  # 图标 URL
    enabled: bool
    min_amount: float  # 最小支付金额
    max_amount: float  # 最大支付金额
