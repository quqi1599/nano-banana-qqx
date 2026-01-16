"""
游客（未登录用户）管理路由
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from app.database import get_db
from app.models.user import User
from app.models.visitor import Visitor
from app.models.conversation import Conversation
from app.schemas.visitor import (
    VisitorResponse,
    VisitorListResponse,
    VisitorFilters,
    VisitorStatsResponse,
)
from app.utils.security import get_admin_user

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/visitors", response_model=VisitorListResponse)
async def list_visitors(
    search: Optional[str] = Query(None, description="搜索游客ID或端点"),
    endpoint: Optional[str] = Query(None, description="筛选端点"),
    min_conversations: Optional[int] = Query(None, description="最小对话数", ge=0),
    min_messages: Optional[int] = Query(None, description="最小消息数", ge=0),
    min_images: Optional[int] = Query(None, description="最小图片数", ge=0),
    first_seen_after: Optional[str] = Query(None, description="首次访问起始 (YYYY-MM-DD)"),
    first_seen_before: Optional[str] = Query(None, description="首次访问结束 (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取游客列表（支持筛选）

    Returns:
        游客列表响应
    """
    # 构建查询
    query = select(Visitor)

    # 搜索筛选（visitor_id 或 custom_endpoint）
    if search:
        query = query.where(
            (Visitor.visitor_id.ilike(f"%{search}%")) |
            (Visitor.custom_endpoint.ilike(f"%{search}%"))
        )

    # 端点筛选
    if endpoint:
        query = query.where(Visitor.custom_endpoint.ilike(f"%{endpoint}%"))

    # 数量筛选
    if min_conversations is not None:
        query = query.where(Visitor.conversation_count >= min_conversations)
    if min_messages is not None:
        query = query.where(Visitor.message_count >= min_messages)
    if min_images is not None:
        query = query.where(Visitor.image_count >= min_images)

    # 时间筛选
    if first_seen_after:
        try:
            after_date = datetime.strptime(first_seen_after, "%Y-%m-%d")
            query = query.where(Visitor.first_seen >= after_date)
        except ValueError:
            pass
    if first_seen_before:
        try:
            before_date = datetime.strptime(first_seen_before, "%Y-%m-%d")
            before_date = before_date.replace(hour=23, minute=59, second=59)
            query = query.where(Visitor.first_seen <= before_date)
        except ValueError:
            pass

    # 获取总数
    count_query = select(func.count(Visitor.id))

    if search:
        count_query = count_query.where(
            (Visitor.visitor_id.ilike(f"%{search}%")) |
            (Visitor.custom_endpoint.ilike(f"%{search}%"))
        )
    if endpoint:
        count_query = count_query.where(Visitor.custom_endpoint.ilike(f"%{endpoint}%"))
    if min_conversations is not None:
        count_query = count_query.where(Visitor.conversation_count >= min_conversations)
    if min_messages is not None:
        count_query = count_query.where(Visitor.message_count >= min_messages)
    if min_images is not None:
        count_query = count_query.where(Visitor.image_count >= min_images)
    if first_seen_after:
        try:
            after_date = datetime.strptime(first_seen_after, "%Y-%m-%d")
            count_query = count_query.where(Visitor.first_seen >= after_date)
        except ValueError:
            pass
    if first_seen_before:
        try:
            before_date = datetime.strptime(first_seen_before, "%Y-%m-%d")
            before_date = before_date.replace(hour=23, minute=59, second=59)
            count_query = count_query.where(Visitor.first_seen <= before_date)
        except ValueError:
            pass

    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # 分页和排序
    query = query.order_by(Visitor.last_seen.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    visitors = result.scalars().all()

    return VisitorListResponse(
        visitors=[VisitorResponse.model_validate(v) for v in visitors],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/visitors/stats", response_model=VisitorStatsResponse)
async def get_visitor_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取游客统计概览

    Returns:
        游客统计数据
    """
    # 总游客数
    total_result = await db.execute(select(func.count(Visitor.id)))
    total_visitors = total_result.scalar() or 0

    # 总对话数、消息数、图片数
    stats_result = await db.execute(
        select(
            func.sum(Visitor.conversation_count),
            func.sum(Visitor.message_count),
            func.sum(Visitor.image_count)
        )
    )
    stats_row = stats_result.first()
    total_conversations = stats_row[0] or 0
    total_messages = stats_row[1] or 0
    total_images = stats_row[2] or 0

    # 热门端点统计
    endpoint_result = await db.execute(
        select(Visitor.custom_endpoint, func.count(Visitor.id))
        .where(Visitor.custom_endpoint.isnot(None))
        .where(Visitor.custom_endpoint != "")
        .group_by(Visitor.custom_endpoint)
        .order_by(func.count(Visitor.id).desc())
        .limit(10)
    )
    top_endpoints = [
        {"endpoint": row[0], "count": row[1]}
        for row in endpoint_result.all()
    ]

    return VisitorStatsResponse(
        total_visitors=total_visitors,
        total_conversations=total_conversations,
        total_messages=total_messages,
        total_images=total_images,
        top_endpoints=top_endpoints,
    )


@router.get("/visitors/{visitor_id}")
async def get_visitor_detail(
    visitor_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取游客详情（包括对话列表）

    Args:
        visitor_id: 游客ID

    Returns:
        游客详情，包含最近10条对话

    Raises:
        HTTPException: 游客不存在时
    """
    result = await db.execute(
        select(Visitor)
        .where(Visitor.visitor_id == visitor_id)
    )
    visitor = result.scalar_one_or_none()

    if not visitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="游客不存在",
        )

    # 获取该游客的对话列表
    conv_result = await db.execute(
        select(Conversation)
        .where(Conversation.visitor_id == visitor_id)
        .order_by(Conversation.updated_at.desc())
        .limit(10)
    )
    conversations = conv_result.scalars().all()

    visitor_dict = VisitorResponse.model_validate(visitor).model_dump()
    visitor_dict["conversations"] = [
        {
            "id": conv.id,
            "title": conv.title,
            "message_count": conv.message_count,
            "model_name": conv.model_name,
            "created_at": conv.created_at.isoformat(),
            "updated_at": conv.updated_at.isoformat(),
        }
        for conv in conversations
    ]

    return visitor_dict


@router.delete("/visitors/{visitor_id}")
async def delete_visitor(
    visitor_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    删除游客记录（含关联对话）

    Args:
        visitor_id: 游客ID

    Returns:
        删除成功消息

    Raises:
        HTTPException: 游客不存在时
    """
    result = await db.execute(
        select(Visitor).where(Visitor.visitor_id == visitor_id)
    )
    visitor = result.scalar_one_or_none()

    if not visitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="游客不存在",
        )

    # 删除关联的对话
    await db.execute(
        delete(Conversation).where(Conversation.visitor_id == visitor_id)
    )

    # 删除游客记录
    await db.delete(visitor)
    await db.commit()

    logger.info("Admin %s deleted visitor %s and associated conversations",
                admin.email, visitor_id)
    return {"message": "删除成功"}
