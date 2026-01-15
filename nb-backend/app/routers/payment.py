"""
支付路由 - 用户端
"""
import os
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.payment_plan import PaymentPlan
from app.models.payment_order import PaymentOrder, UsdtPaymentRecord
from app.schemas.payment import (
    PaymentPlanResponse,
    CreateOrderRequest,
    OrderResponse,
    OrderDetailResponse,
    UsdtPaymentInfo,
    ExchangeRateResponse,
    PaymentMethod,
    OrderStatus,
)
from app.services.usdt_service import UsdtPaymentService, UsdtPaymentError
from app.utils.security import get_current_user

router = APIRouter()


# ========== 套餐相关 ==========

@router.get("/plans", response_model=List[PaymentPlanResponse])
async def get_payment_plans(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    """获取可购买套餐列表"""
    query = select(PaymentPlan)

    if active_only:
        query = query.where(PaymentPlan.is_active == True)

    query = query.order_by(PaymentPlan.sort_order, PaymentPlan.price_usd)

    result = await db.execute(query)
    plans = result.scalars().all()

    return plans


@router.get("/plans/{plan_id}", response_model=PaymentPlanResponse)
async def get_payment_plan(
    plan_id: str,
    db: AsyncSession = Depends(get_db),
):
    """获取单个套餐详情"""
    result = await db.execute(
        select(PaymentPlan).where(PaymentPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="套餐不存在"
        )

    return plan


# ========== 订单相关 ==========

@router.post("/orders/create", response_model=OrderResponse)
async def create_payment_order(
    data: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建支付订单"""
    # 获取套餐
    result = await db.execute(
        select(PaymentPlan).where(PaymentPlan.id == data.plan_id)
    )
    plan = result.scalar_one_or_none()

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="套餐不存在"
        )

    if not plan.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="套餐已下架"
        )

    # 初始化支付服务
    service = UsdtPaymentService(db)

    # 获取汇率
    exchange_rate = await service.get_exchange_rate()

    try:
        # 创建订单
        order = await service.create_order(
            user=current_user,
            plan=plan,
            payment_method=data.payment_method,
            exchange_rate=exchange_rate
        )

        return order

    except UsdtPaymentError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/orders/{trade_no}", response_model=OrderDetailResponse)
async def get_order_detail(
    trade_no: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取订单详情"""
    result = await db.execute(
        select(PaymentOrder)
        .options(selectinload(PaymentOrder.plan))
        .where(PaymentOrder.trade_no == trade_no)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="订单不存在"
        )

    # 验证订单所有权
    if order.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问此订单"
        )

    # 检查订单是否过期
    service = UsdtPaymentService(db)
    await service.check_order_expiry(order)

    return order


@router.get("/orders", response_model=List[OrderResponse])
async def get_my_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    status_filter: str = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取我的订单列表"""
    query = select(PaymentOrder).where(PaymentOrder.user_id == current_user.id)

    if status_filter:
        query = query.where(PaymentOrder.status == status_filter)

    query = query.order_by(PaymentOrder.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    orders = result.scalars().all()

    return orders


@router.post("/orders/{trade_no}/cancel")
async def cancel_order(
    trade_no: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """取消订单"""
    result = await db.execute(
        select(PaymentOrder).where(PaymentOrder.trade_no == trade_no)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="订单不存在"
        )

    # 验证订单所有权
    if order.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权操作此订单"
        )

    service = UsdtPaymentService(db)
    success = await service.cancel_order(order)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="订单状态不允许取消"
        )

    return {"message": "订单已取消"}


@router.get("/orders/{trade_no}/payment-info", response_model=UsdtPaymentInfo)
async def get_payment_info(
    trade_no: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取支付信息（地址、二维码等）"""
    result = await db.execute(
        select(PaymentOrder).where(PaymentOrder.trade_no == trade_no)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="订单不存在"
        )

    # 验证订单所有权
    if order.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问此订单"
        )

    # 检查订单是否过期
    service = UsdtPaymentService(db)
    await service.check_order_expiry(order)

    if order.status != OrderStatus.PENDING.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"订单状态为 {order.status}，无法获取支付信息"
        )

    # 获取汇率
    exchange_rate = await service.get_exchange_rate()

    # 生成二维码 URL（使用第三方二维码生成服务）
    qr_code_url = None
    if order.wallet_address:
        # TRC20 地址直接生成二维码
        qr_data = f"{order.network}:{order.wallet_address}?amount={order.expected_amount}"
        # 使用公共 API 生成二维码
        qr_code_url = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={qr_data}"

    return UsdtPaymentInfo(
        wallet_address=order.wallet_address,
        network=order.network,
        expected_amount=order.expected_amount,
        qr_code_url=qr_code_url,
        exchange_rate=exchange_rate,
        expires_at=order.expires_at or datetime.utcnow() + timedelta(minutes=30)
    )


# ========== 汇率相关 ==========

@router.get("/exchange-rate", response_model=ExchangeRateResponse)
async def get_exchange_rate(
    db: AsyncSession = Depends(get_db),
):
    """获取当前汇率"""
    service = UsdtPaymentService(db)
    rate = await service.get_exchange_rate()

    return ExchangeRateResponse(
        usdt_usd=rate,
        updated_at=datetime.utcnow()
    )


# ========== 支付回调 ==========

@router.post("/webhook/usdt")
async def usdt_payment_callback(
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    USDT 支付回调接口

    此接口由支付网关或区块链监听服务调用
    需要验证签名确保请求来自可信来源
    """
    service = UsdtPaymentService(db)

    # 验证签名
    signature = data.get("signature", "")
    if not service.verify_signature(data, signature):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="签名验证失败"
        )

    # 获取订单
    trade_no = data.get("trade_no")
    if not trade_no:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="缺少订单号"
        )

    result = await db.execute(
        select(PaymentOrder).where(PaymentOrder.trade_no == trade_no)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="订单不存在"
        )

    # 检查订单状态
    if order.status == OrderStatus.PAID.value:
        return {"success": True, "message": "订单已支付"}

    if order.status != OrderStatus.PENDING.value:
        return {"success": False, "message": f"订单状态为 {order.status}，无法处理"}

    # 验证交易
    tx_hash = data.get("tx_hash")
    amount = float(data.get("amount", 0))
    confirmations = data.get("confirmations", 0)

    # 更新支付记录
    payment_record = UsdtPaymentRecord(
        order_id=order.id,
        from_address=data.get("from_address", ""),
        to_address=data.get("to_address", ""),
        amount=amount,
        network=data.get("network", ""),
        tx_hash=tx_hash,
        block_number=data.get("block_number"),
        confirmations=confirmations,
        status="verified" if confirmations >= 6 else "pending"
    )
    db.add(payment_record)

    # 处理支付
    result_data = await service.process_payment(
        order=order,
        tx_hash=tx_hash,
        amount=amount,
        confirmations=confirmations
    )

    await db.commit()

    return result_data


# ========== 支付方式配置 ==========

@router.get("/payment-methods")
async def get_payment_methods(
    db: AsyncSession = Depends(get_db),
):
    """获取可用支付方式列表"""
    trc20_enabled = bool(os.getenv("TRON_COLLECTION_ADDRESS"))
    erc20_enabled = bool(os.getenv("ETH_COLLECTION_ADDRESS"))
    bep20_enabled = bool(os.getenv("BSC_COLLECTION_ADDRESS"))

    return [
        {
            "method": "usdt_trc20",
            "name": "USDT (TRC20)",
            "icon": "/icons/usdt-trc20.svg",
            "enabled": trc20_enabled,
            "min_amount": 1.0,
            "max_amount": 10000.0,
            "description": "波场链，手续费低，确认快"
        },
        {
            "method": "usdt_erc20",
            "name": "USDT (ERC20)",
            "icon": "/icons/usdt-erc20.svg",
            "enabled": erc20_enabled,
            "min_amount": 1.0,
            "max_amount": 10000.0,
            "description": "以太坊链，生态完善"
        },
        {
            "method": "usdt_bep20",
            "name": "USDT (BEP20)",
            "icon": "/icons/usdt-bep20.svg",
            "enabled": bep20_enabled,
            "min_amount": 1.0,
            "max_amount": 10000.0,
            "description": "币安智能链，手续费适中"
        },
    ]
