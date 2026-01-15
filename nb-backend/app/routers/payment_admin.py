"""
支付路由 - 管理员端
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.payment_plan import PaymentPlan
from app.models.payment_order import PaymentOrder, UsdtPaymentRecord
from app.schemas.payment import (
    PaymentPlanCreate,
    PaymentPlanUpdate,
    PaymentPlanResponse,
    OrderDetailResponse,
    PaymentStatsResponse,
)
from app.services.usdt_service import UsdtPaymentService
from app.utils.security import get_current_user, get_admin_user

router = APIRouter()


# ========== 套餐管理 ==========

@router.get("/plans", response_model=List[PaymentPlanResponse])
async def admin_get_plans(
    include_inactive: bool = False,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取所有套餐（管理员）"""
    query = select(PaymentPlan)

    if not include_inactive:
        query = query.where(PaymentPlan.is_active == True)

    query = query.order_by(PaymentPlan.sort_order, PaymentPlan.price_usd)

    result = await db.execute(query)
    plans = result.scalars().all()

    return plans


@router.post("/plans", response_model=PaymentPlanResponse)
async def create_plan(
    data: PaymentPlanCreate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """创建套餐（管理员）"""
    plan = PaymentPlan(
        name=data.name,
        description=data.description,
        credits=data.credits,
        price_usd=data.price_usd,
        is_active=data.is_active,
        sort_order=data.sort_order,
        is_popular=data.is_popular,
    )

    db.add(plan)
    await db.commit()
    await db.refresh(plan)

    return plan


@router.put("/plans/{plan_id}", response_model=PaymentPlanResponse)
async def update_plan(
    plan_id: str,
    data: PaymentPlanUpdate,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新套餐（管理员）"""
    result = await db.execute(
        select(PaymentPlan).where(PaymentPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="套餐不存在"
        )

    # 更新字段
    if data.name is not None:
        plan.name = data.name
    if data.description is not None:
        plan.description = data.description
    if data.credits is not None:
        plan.credits = data.credits
    if data.price_usd is not None:
        plan.price_usd = data.price_usd
    if data.sort_order is not None:
        plan.sort_order = data.sort_order
    if data.is_active is not None:
        plan.is_active = data.is_active
    if data.is_popular is not None:
        plan.is_popular = data.is_popular

    plan.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(plan)

    return plan


@router.delete("/plans/{plan_id}")
async def delete_plan(
    plan_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """删除套餐（管理员）"""
    result = await db.execute(
        select(PaymentPlan).where(PaymentPlan.id == plan_id)
    )
    plan = result.scalar_one_or_none()

    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="套餐不存在"
        )

    await db.delete(plan)
    await db.commit()

    return {"message": "套餐已删除"}


# ========== 订单管理 ==========

@router.get("/orders", response_model=List[OrderDetailResponse])
async def admin_get_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = None,
    payment_method: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取所有订单（管理员）"""
    query = select(PaymentOrder).options(selectinload(PaymentOrder.plan))

    if status_filter:
        query = query.where(PaymentOrder.status == status_filter)

    if payment_method:
        query = query.where(PaymentOrder.payment_method == payment_method)

    if search:
        # 搜索订单号或用户邮箱
        from app.models.user import User
        query = query.outerjoin(User, PaymentOrder.user_id == User.id).where(
            (PaymentOrder.trade_no.contains(search)) |
            (User.email.contains(search))
        )

    query = query.order_by(PaymentOrder.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    orders = result.scalars().all()

    return orders


@router.get("/orders/stats", response_model=PaymentStatsResponse)
async def get_payment_stats(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取支付统计（管理员）"""
    # 总订单数
    total_result = await db.execute(
        select(func.count(PaymentOrder.id))
    )
    total_orders = total_result.scalar() or 0

    # 待支付订单数
    pending_result = await db.execute(
        select(func.count(PaymentOrder.id)).where(PaymentOrder.status == "pending")
    )
    pending_orders = pending_result.scalar() or 0

    # 已支付订单数
    paid_result = await db.execute(
        select(func.count(PaymentOrder.id)).where(PaymentOrder.status == "paid")
    )
    paid_orders = paid_result.scalar() or 0

    # 总收入
    revenue_result = await db.execute(
        select(func.sum(PaymentOrder.amount)).where(PaymentOrder.status == "paid")
    )
    total_revenue = revenue_result.scalar() or 0

    # 今日收入
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_revenue_result = await db.execute(
        select(func.sum(PaymentOrder.amount)).where(
            PaymentOrder.status == "paid",
            PaymentOrder.paid_at >= today_start
        )
    )
    today_revenue = today_revenue_result.scalar() or 0

    # USDT 收入
    usdt_revenue_result = await db.execute(
        select(func.sum(PaymentOrder.received_amount)).where(
            PaymentOrder.status == "paid",
            PaymentOrder.payment_method.like("usdt_%")
        )
    )
    usdt_revenue = usdt_revenue_result.scalar() or 0

    return PaymentStatsResponse(
        total_orders=total_orders,
        pending_orders=pending_orders,
        paid_orders=paid_orders,
        total_revenue=float(total_revenue),
        today_revenue=float(today_revenue),
        usdt_revenue=float(usdt_revenue),
    )


@router.get("/orders/{trade_no}", response_model=OrderDetailResponse)
async def admin_get_order_detail(
    trade_no: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取订单详情（管理员）"""
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

    return order


@router.post("/orders/{trade_no}/verify")
async def verify_payment(
    trade_no: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """手动验证支付（管理员）"""
    result = await db.execute(
        select(PaymentOrder).where(PaymentOrder.trade_no == trade_no)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="订单不存在"
        )

    if order.status == "paid":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="订单已支付"
        )

    if not order.tx_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="订单没有交易哈希"
        )

    service = UsdtPaymentService(db)

    # 根据支付方式验证交易
    if order.payment_method == "usdt_trc20":
        result_data = await service.verify_trc20_transaction(
            tx_hash=order.tx_hash,
            expected_amount=float(order.expected_amount),
            to_address=order.wallet_address
        )

        if result_data.get("valid"):
            # 完成支付
            complete_result = await service.complete_payment(order)
            await db.commit()
            return complete_result
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result_data.get("error", "验证失败")
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"暂不支持验证 {order.payment_method} 交易"
        )


@router.post("/orders/{trade_no}/complete")
async def admin_complete_payment(
    trade_no: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """强制完成支付（管理员）"""
    result = await db.execute(
        select(PaymentOrder).where(PaymentOrder.trade_no == trade_no)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="订单不存在"
        )

    service = UsdtPaymentService(db)
    result_data = await service.complete_payment(order)

    await db.commit()

    return result_data


@router.post("/orders/{trade_no}/cancel")
async def admin_cancel_order(
    trade_no: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """取消订单（管理员）"""
    result = await db.execute(
        select(PaymentOrder).where(PaymentOrder.trade_no == trade_no)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="订单不存在"
        )

    service = UsdtPaymentService(db)
    success = await service.cancel_order(order)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="订单状态不允许取消"
        )

    return {"message": "订单已取消"}
