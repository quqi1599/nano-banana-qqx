"""
管理后台路由 - 主入口

聚合所有管理后台子路由，提供统一的管理API。

模块结构:
    - init: 管理员初始化和二次确认
    - tokens: Token池管理
    - pricing: 模型计费配置
    - users: 用户管理
    - email: 邮件配置和邮箱白名单
    - conversations: 对话历史和清理
    - visitors: 游客管理
    - redeem: 兑换码管理
"""
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.redeem_code import RedeemCode, generate_redeem_code
from app.schemas.redeem import GenerateCodesRequest, GenerateCodesResponse, RedeemCodeInfo
from app.utils.security import get_admin_user
from app.utils.rate_limiter import RateLimiter

from .init import router as init_router
from .tokens import router as tokens_router
from .pricing import router as pricing_router
from .users import router as users_router
from .email import router as email_router
from .conversations import router as conversations_router
from .visitors import router as visitors_router

logger = logging.getLogger(__name__)

# 创建主路由器，聚合所有子路由
router = APIRouter()

# 包含子路由（使用 prefix 和 tags 保持原有路径）
router.include_router(init_router, tags=["管理后台-初始化"])
router.include_router(tokens_router, tags=["管理后台-Token"])
router.include_router(pricing_router, tags=["管理后台-计费"])
router.include_router(users_router, tags=["管理后台-用户"])
router.include_router(email_router, tags=["管理后台-邮件"])
router.include_router(conversations_router, tags=["管理后台-对话"])
router.include_router(visitors_router, tags=["管理后台-游客"])


# ============ 兑换码管理 ============
# 兑换码管理保持在主路由中，因为它是独立的功能模块


@router.get("/redeem-codes", response_model=list[RedeemCodeInfo])
async def list_redeem_codes(
    batch_id: Optional[str] = Query(None, description="批次ID"),
    is_used: Optional[bool] = Query(None, description="是否已使用"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取兑换码列表

    Args:
        batch_id: 批次ID筛选
        is_used: 使用状态筛选
        page: 页码
        page_size: 每页数量

    Returns:
        兑换码列表
    """
    query = select(RedeemCode)

    if batch_id:
        query = query.where(RedeemCode.batch_id == batch_id)
    if is_used is not None:
        query = query.where(RedeemCode.is_used == is_used)

    query = query.order_by(RedeemCode.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    codes = result.scalars().all()

    return [RedeemCodeInfo.model_validate(c) for c in codes]


@router.post(
    "/redeem-codes/generate",
    response_model=GenerateCodesResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def generate_redeem_codes(
    data: GenerateCodesRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    批量生成兑换码

    生成指定数量和面值的兑换码，支持设置有效期。

    Args:
        data: 兑换码生成请求，包含数量、面值、有效期等

    Returns:
        生成的兑换码列表

    Raises:
        HTTPException: 生成失败时
    """
    batch_id = str(uuid.uuid4())
    expires_at = None
    if data.expires_days:
        expires_at = datetime.utcnow() + timedelta(days=data.expires_days)

    codes: list[str] = []
    seen_codes: set[str] = set()
    attempts = 0
    max_attempts = max(1000, data.count * 10)

    while len(codes) < data.count and attempts < max_attempts:
        remaining = data.count - len(codes)
        candidate_codes: set[str] = set()

        while len(candidate_codes) < remaining and attempts < max_attempts:
            new_code = generate_redeem_code()
            attempts += 1
            if new_code in seen_codes:
                continue
            candidate_codes.add(new_code)
            seen_codes.add(new_code)

        if not candidate_codes:
            break

        values = [
            {
                "code": code_value,
                "credit_amount": data.credit_amount,
                "pro3_credits": data.pro3_credits,
                "flash_credits": data.flash_credits,
                "remark": data.remark,
                "batch_id": batch_id,
                "expires_at": expires_at,
            }
            for code_value in candidate_codes
        ]
        stmt = (
            insert(RedeemCode)
            .values(values)
            .on_conflict_do_nothing(index_elements=[RedeemCode.code])
            .returning(RedeemCode.code)
        )
        result = await db.execute(stmt)
        codes.extend(result.scalars().all())

    if len(codes) < data.count:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="生成兑换码失败，请稍后重试",
        )

    await db.commit()

    logger.info("Admin %s generated %d redeem codes (batch=%s)",
                admin.email, data.count, batch_id)

    return GenerateCodesResponse(
        batch_id=batch_id,
        codes=codes,
        count=data.count,
        credit_amount=data.credit_amount,
        pro3_credits=data.pro3_credits,
        flash_credits=data.flash_credits,
        remark=data.remark,
    )


# 导出主路由器供 main.py 使用
__all__ = ["router"]
