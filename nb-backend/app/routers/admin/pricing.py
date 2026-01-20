"""
模型计费配置路由
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.model_pricing import ModelPricing
from app.schemas.admin import (
    ModelPricingCreate,
    ModelPricingUpdate,
    ModelPricingResponse,
)
from app.utils.security import get_admin_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/model-pricing", response_model=list[ModelPricingResponse])
async def list_model_pricing(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取模型计费配置

    Returns:
        模型计费配置列表，按模型名称排序
    """
    result = await db.execute(
        select(ModelPricing).order_by(ModelPricing.model_name.asc())
    )
    return [ModelPricingResponse.model_validate(p) for p in result.scalars().all()]


@router.post("/model-pricing", response_model=ModelPricingResponse)
async def create_model_pricing(
    data: ModelPricingCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    新增模型计费配置

    Args:
        data: 模型计费配置数据

    Returns:
        创建的模型计费配置

    Raises:
        HTTPException: 模型已存在或灵感值无效时
    """
    if data.credits_per_request <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="灵感值必须大于 0",
        )

    result = await db.execute(
        select(ModelPricing).where(ModelPricing.model_name == data.model_name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="模型已存在，请直接修改",
        )

    pricing = ModelPricing(
        model_name=data.model_name,
        credits_per_request=data.credits_per_request,
    )
    db.add(pricing)
    await db.commit()
    await db.refresh(pricing)

    logger.info("Admin %s created model pricing %s", admin.email, data.model_name)
    return ModelPricingResponse.model_validate(pricing)


@router.put("/model-pricing/{pricing_id}", response_model=ModelPricingResponse)
async def update_model_pricing(
    pricing_id: str,
    data: ModelPricingUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    更新模型计费配置

    Args:
        pricing_id: 计费配置ID
        data: 更新数据

    Returns:
        更新后的模型计费配置

    Raises:
        HTTPException: 配置不存在或扣点次数无效时
    """
    if data.credits_per_request <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="扣点次数必须大于 0",
        )

    result = await db.execute(
        select(ModelPricing).where(ModelPricing.id == pricing_id)
    )
    pricing = result.scalar_one_or_none()
    if not pricing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="计费配置不存在",
        )

    pricing.credits_per_request = data.credits_per_request
    await db.commit()
    await db.refresh(pricing)

    logger.info("Admin %s updated model pricing %s", admin.email, pricing.model_name)
    return ModelPricingResponse.model_validate(pricing)
