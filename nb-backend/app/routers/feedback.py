"""
用户反馈 API 路由

提供用户反馈的提交、查询、管理功能
"""
import logging
from datetime import datetime
from typing import Optional, Any, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Body
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database import get_db
from app.utils.security import get_current_user, get_current_user_optional, get_admin_user
from app.models.user import User
from app.models.user_feedback import UserFeedback

logger = logging.getLogger(__name__)

router = APIRouter(tags=["用户反馈"])


class FeedbackCreate(BaseModel):
    title: str
    content: str
    feedback_type: str = "other"
    category: Optional[str] = None
    related_conversation_id: Optional[str] = None
    related_task_id: Optional[str] = None
    related_model: Optional[str] = None
    page_url: Optional[str] = None
    browser_info: Optional[str] = None
    extra_data: Optional[dict] = None
    screenshots: Optional[List[str]] = None


@router.post("")
async def create_feedback(
    request: Request,
    payload: Optional[FeedbackCreate] = Body(default=None),
    title: Optional[str] = None,
    content: Optional[str] = None,
    feedback_type: str = "other",
    category: Optional[str] = None,
    related_conversation_id: Optional[str] = None,
    related_task_id: Optional[str] = None,
    related_model: Optional[str] = None,
    page_url: Optional[str] = None,
    browser_info: Optional[str] = None,
    extra_data: Optional[dict] = None,
    screenshots: Optional[List[str]] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    提交用户反馈

    Args:
        title: 反馈标题
        content: 反馈内容
        feedback_type: 反馈类型 (bug/feature/improvement/complaint/other)
        category: 反馈分类 (ui/performance/api/billing/content/etc.)
        related_conversation_id: 相关会话ID
        related_task_id: 相关任务ID
        related_model: 相关模型名称
        page_url: 页面URL
        browser_info: 浏览器信息
        extra_data: 额外数据
        screenshots: 截图URL列表
    """
    if payload:
        title = payload.title
        content = payload.content
        feedback_type = payload.feedback_type
        category = payload.category
        related_conversation_id = payload.related_conversation_id
        related_task_id = payload.related_task_id
        related_model = payload.related_model
        page_url = payload.page_url
        browser_info = payload.browser_info
        extra_data = payload.extra_data
        screenshots = payload.screenshots

    if not title or not content:
        raise HTTPException(status_code=400, detail="title and content are required")

    # 验证反馈类型
    valid_types = {"bug", "feature", "improvement", "complaint", "other"}
    if feedback_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"无效的反馈类型，可选值: {', '.join(valid_types)}"
        )

    # 获取IP和User-Agent
    ip_address = None
    user_agent = None
    if request:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

    feedback = UserFeedback(
        user_id=current_user.id if current_user else None,
        feedback_type=feedback_type,
        category=category,
        title=title,
        content=content,
        related_conversation_id=related_conversation_id,
        related_task_id=related_task_id,
        related_model=related_model,
        page_url=page_url,
        browser_info=browser_info,
        extra_data=extra_data,
        screenshots=screenshots,
        ip_address=ip_address,
        user_agent=user_agent,
        status="pending",
        priority="normal",
    )

    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)

    logger.info(
        f"Feedback created: id={feedback.id}, type={feedback_type}, "
        f"user={current_user.id if current_user else 'anonymous'}"
    )

    return {
        "id": feedback.id,
        "status": feedback.status,
        "message": "反馈已提交，感谢您的反馈！",
    }


@router.get("")
async def list_feedbacks(
    status: Optional[str] = None,
    feedback_type: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    获取反馈列表（管理员）

    Args:
        status: 状态过滤 (pending/reviewing/resolved/rejected/closed)
        feedback_type: 类型过滤
        category: 分类过滤
        priority: 优先级过滤 (low/normal/high/urgent)
        user_id: 用户ID过滤
        limit: 返回数量
        offset: 偏移量
    """
    query = select(UserFeedback)

    # 应用过滤条件
    if status:
        query = query.where(UserFeedback.status == status)
    if feedback_type:
        query = query.where(UserFeedback.feedback_type == feedback_type)
    if category:
        query = query.where(UserFeedback.category == category)
    if priority:
        query = query.where(UserFeedback.priority == priority)
    if user_id:
        query = query.where(UserFeedback.user_id == user_id)

    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # 分页和排序
    query = query.order_by(desc(UserFeedback.created_at))
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    feedbacks = result.scalars().all()

    return {
        "items": [f.to_dict() for f in feedbacks],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/my")
async def get_my_feedbacks(
    status: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    获取当前用户的反馈列表
    """
    query = select(UserFeedback).where(UserFeedback.user_id == current_user.id)

    if status:
        query = query.where(UserFeedback.status == status)

    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(desc(UserFeedback.created_at))
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    feedbacks = result.scalars().all()

    return {
        "items": [f.to_dict() for f in feedbacks],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/stats")
async def get_feedback_stats(
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    获取反馈统计信息（管理员）
    """
    # 按状态统计
    status_stats = await db.execute(
        select(UserFeedback.status, func.count(UserFeedback.id))
        .group_by(UserFeedback.status)
    )
    status_counts = {row[0]: row[1] for row in status_stats.all()}

    # 按类型统计
    type_stats = await db.execute(
        select(UserFeedback.feedback_type, func.count(UserFeedback.id))
        .group_by(UserFeedback.feedback_type)
    )
    type_counts = {row[0]: row[1] for row in type_stats.all()}

    # 按优先级统计
    priority_stats = await db.execute(
        select(UserFeedback.priority, func.count(UserFeedback.id))
        .group_by(UserFeedback.priority)
    )
    priority_counts = {row[0]: row[1] for row in priority_stats.all()}

    # 待处理数量
    pending_count = status_counts.get("pending", 0) + status_counts.get("reviewing", 0)

    # 最近7天的反馈数量
    from datetime import timedelta
    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_result = await db.execute(
        select(func.count()).where(UserFeedback.created_at >= week_ago)
    )
    recent_count = recent_result.scalar() or 0

    return {
        "by_status": status_counts,
        "by_type": type_counts,
        "by_priority": priority_counts,
        "pending_count": pending_count,
        "recent_week_count": recent_count,
    }


@router.get("/{feedback_id}")
async def get_feedback(
    feedback_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    获取反馈详情
    """
    result = await db.execute(
        select(UserFeedback).where(UserFeedback.id == feedback_id)
    )
    feedback = result.scalar_one_or_none()

    if not feedback:
        raise HTTPException(status_code=404, detail="反馈不存在")

    # 非管理员只能查看自己的反馈
    if not current_user.is_admin and feedback.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看此反馈")

    return feedback.to_dict()


@router.put("/{feedback_id}")
async def update_feedback(
    feedback_id: str,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    admin_notes: Optional[str] = None,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    更新反馈状态（管理员）
    """
    result = await db.execute(
        select(UserFeedback).where(UserFeedback.id == feedback_id)
    )
    feedback = result.scalar_one_or_none()

    if not feedback:
        raise HTTPException(status_code=404, detail="反馈不存在")

    # 更新字段
    if status:
        valid_statuses = {"pending", "reviewing", "resolved", "rejected", "closed"}
        if status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"无效的状态，可选值: {', '.join(valid_statuses)}"
            )
        feedback.status = status
        if status in {"resolved", "rejected", "closed"}:
            feedback.resolved_at = datetime.utcnow()
        feedback.admin_id = current_user.id

    if priority:
        valid_priorities = {"low", "normal", "high", "urgent"}
        if priority not in valid_priorities:
            raise HTTPException(
                status_code=400,
                detail=f"无效的优先级，可选值: {', '.join(valid_priorities)}"
            )
        feedback.priority = priority

    if admin_notes is not None:
        feedback.admin_notes = admin_notes

    feedback.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(feedback)

    logger.info(
        f"Feedback updated: id={feedback_id}, status={status}, "
        f"admin={current_user.id}"
    )

    return feedback.to_dict()


@router.post("/{feedback_id}/rate")
async def rate_feedback(
    feedback_id: str,
    rating: int = Query(..., ge=1, le=5),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    对反馈处理结果进行评分
    """
    result = await db.execute(
        select(UserFeedback).where(UserFeedback.id == feedback_id)
    )
    feedback = result.scalar_one_or_none()

    if not feedback:
        raise HTTPException(status_code=404, detail="反馈不存在")

    # 只能评分自己的反馈
    if feedback.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权对此反馈评分")

    # 只能对已解决的反馈评分
    if feedback.status not in {"resolved", "closed"}:
        raise HTTPException(status_code=400, detail="只能对已解决的反馈评分")

    feedback.user_rating = rating
    feedback.updated_at = datetime.utcnow()

    await db.commit()

    return {"message": "评分成功", "rating": rating}


@router.delete("/{feedback_id}")
async def delete_feedback(
    feedback_id: str,
    current_user: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    删除反馈（管理员）
    """
    result = await db.execute(
        select(UserFeedback).where(UserFeedback.id == feedback_id)
    )
    feedback = result.scalar_one_or_none()

    if not feedback:
        raise HTTPException(status_code=404, detail="反馈不存在")

    await db.delete(feedback)
    await db.commit()

    logger.info(f"Feedback deleted: id={feedback_id}, admin={current_user.id}")

    return {"message": "反馈已删除"}
