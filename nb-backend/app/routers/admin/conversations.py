"""
对话历史管理和清理路由
"""
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, cast, Date
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.conversation import Conversation, ConversationMessage
from app.schemas.admin import (
    UserConversationStats,
    ConversationTimelineItem,
    ConversationTimelineResponse,
)
from app.schemas.conversation import (
    AdminConversationResponse,
    AdminConversationDetailResponse,
    ConversationResponse,
    MessageResponse,
    UserType,
)
from app.utils.security import get_admin_user
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

DEFAULT_API_ENDPOINT = settings.default_api_endpoint

router = APIRouter()


def _normalize_conversation_role(role: str) -> str:
    """标准化对话角色名称"""
    if role == "assistant":
        return "model"
    return role


def _parse_conversation_images(raw_images: Optional[str]) -> Optional[list[dict]]:
    """
    解析对话图片数据

    Args:
        raw_images: JSON格式的图片数据

    Returns:
        解析后的图片列表或None
    """
    if not raw_images:
        return None
    try:
        data = json.loads(raw_images)
    except (TypeError, ValueError):
        return None
    if not isinstance(data, list):
        return None
    normalized: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        base64 = item.get("base64")
        mime_type = item.get("mimeType")
        if not base64 or not mime_type:
            continue
        normalized.append({"base64": base64, "mimeType": mime_type})
    return normalized or None


def _serialize_admin_message(message: ConversationMessage) -> MessageResponse:
    """
    序列化管理员消息

    Args:
        message: 消息对象

    Returns:
        消息响应
    """
    return MessageResponse(
        id=message.id,
        role=_normalize_conversation_role(message.role),
        content=message.content,
        images=_parse_conversation_images(message.images),
        is_thought=message.is_thought,
        thinking_duration=message.thinking_duration,
        created_at=message.created_at,
    )


def _determine_user_type(conversation: Conversation, user_tags: Optional[list[str]]) -> UserType:
    """
    确定用户类型

    Args:
        conversation: 对话对象
        user_tags: 用户标签

    Returns:
        用户类型
    """
    tags = user_tags or []
    if conversation.user_id:
        return "api_key" if "api_key" in tags else "user"
    return "visitor"


def _build_admin_conversation_response(
    conversation: Conversation,
    user_email: Optional[str],
    user_nickname: Optional[str],
    user_tags: Optional[list[str]],
) -> AdminConversationResponse:
    """
    构建管理员对话响应

    Args:
        conversation: 对话对象
        user_email: 用户邮箱
        user_nickname: 用户昵称
        user_tags: 用户标签

    Returns:
        管理员对话响应（包含 api_key_prefix 用于分组显示）
    """
    conv_dict = ConversationResponse.model_validate(conversation).model_dump()
    conv_dict["user_email"] = user_email or (
        f"Guest ({conversation.visitor_id[:8]}...)" if conversation.visitor_id else "Guest"
    )
    conv_dict["user_nickname"] = user_nickname or "Anonymous"
    conv_dict["user_type"] = _determine_user_type(conversation, user_tags)
    conv_dict["uses_custom_endpoint"] = bool(
        conversation.custom_endpoint and conversation.custom_endpoint != DEFAULT_API_ENDPOINT
    )
    # Admin 可以看到 api_key_prefix，用于分组和排查
    # 如果是登录用户，这个字段为 None
    # 如果是未登录用户，会记录脱敏的 API Key 前缀
    conv_dict["api_key_prefix"] = conversation.api_key_prefix
    return AdminConversationResponse(**conv_dict)


# ============ 对话历史管理 ============


@router.get("/conversations")
async def list_conversations(
    user_id: Optional[str] = Query(None, description="筛选用户ID"),
    search: Optional[str] = Query(None, description="搜索邮箱或对话标题"),
    date_from: Optional[str] = Query(None, description="起始日期 (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    model_name: Optional[str] = Query(None, description="筛选模型"),
    min_messages: Optional[int] = Query(None, description="最小消息数", ge=0),
    max_messages: Optional[int] = Query(None, description="最大消息数", ge=0),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取所有用户的对话列表（支持高级筛选）

    Returns:
        对话列表响应
    """
    # 构建查询
    query = (
        select(Conversation, User.email, User.nickname, User.tags)
        .outerjoin(User, Conversation.user_id == User.id)
    )

    # 用户筛选
    if user_id:
        query = query.where(Conversation.user_id == user_id)

    # 搜索筛选（按用户邮箱或对话标题）
    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) |
            (Conversation.title.ilike(f"%{search}%"))
        )

    # 时间范围筛选
    if date_from:
        try:
            after_date = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.where(Conversation.created_at >= after_date)
        except ValueError:
            pass

    if date_to:
        try:
            before_date = datetime.strptime(date_to, "%Y-%m-%d")
            # 包含当天，所以加一天
            before_date = before_date.replace(hour=23, minute=59, second=59)
            query = query.where(Conversation.created_at <= before_date)
        except ValueError:
            pass

    # 模型筛选
    if model_name:
        query = query.where(Conversation.model_name == model_name)

    # 消息数量范围筛选
    if min_messages is not None:
        query = query.where(Conversation.message_count >= min_messages)
    if max_messages is not None:
        query = query.where(Conversation.message_count <= max_messages)

    # 获取总数（应用相同的筛选条件）
    count_query = select(func.count(Conversation.id)).select_from(Conversation)
    count_query = count_query.outerjoin(User, Conversation.user_id == User.id)

    if user_id:
        count_query = count_query.where(Conversation.user_id == user_id)
    if search:
        count_query = count_query.where(
            (User.email.ilike(f"%{search}%")) |
            (Conversation.title.ilike(f"%{search}%"))
        )
    if date_from:
        try:
            after_date = datetime.strptime(date_from, "%Y-%m-%d")
            count_query = count_query.where(Conversation.created_at >= after_date)
        except ValueError:
            pass
    if date_to:
        try:
            before_date = datetime.strptime(date_to, "%Y-%m-%d")
            before_date = before_date.replace(hour=23, minute=59, second=59)
            count_query = count_query.where(Conversation.created_at <= before_date)
        except ValueError:
            pass
    if model_name:
        count_query = count_query.where(Conversation.model_name == model_name)
    if min_messages is not None:
        count_query = count_query.where(Conversation.message_count >= min_messages)
    if max_messages is not None:
        count_query = count_query.where(Conversation.message_count <= max_messages)

    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # 分页和排序
    query = query.order_by(Conversation.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    # 构建响应
    response = []
    for conv, user_email, user_nickname, user_tags in rows:
        response.append(
            _build_admin_conversation_response(conv, user_email, user_nickname, user_tags)
        )

    return JSONResponse(
        content={
            "conversations": [r.model_dump(mode="json") for r in response],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@router.get("/conversations/{conversation_id}", response_model=AdminConversationDetailResponse)
async def get_conversation_detail(
    conversation_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    管理员查看对话详情

    Args:
        conversation_id: 对话ID

    Returns:
        对话详情响应

    Raises:
        HTTPException: 对话不存在时
    """
    result = await db.execute(
        select(Conversation, User.email, User.nickname, User.tags)
        .outerjoin(User, Conversation.user_id == User.id)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    conversation, user_email, user_nickname, user_tags = row
    messages = [_serialize_admin_message(msg) for msg in conversation.messages]
    base = _build_admin_conversation_response(conversation, user_email, user_nickname, user_tags).model_dump()
    return AdminConversationDetailResponse(**base, messages=messages)


@router.delete("/conversations/{conversation_id}")
async def delete_conversation_admin(
    conversation_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    管理员删除对话

    Args:
        conversation_id: 对话ID

    Returns:
        删除成功消息

    Raises:
        HTTPException: 对话不存在时
    """
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    await db.delete(conversation)
    await db.commit()

    logger.info("Admin %s deleted conversation %s", admin.email, conversation_id)
    return {"message": "删除成功"}


# ============ 用户对话统计 ============


@router.get("/users/{user_id}/conversation-stats", response_model=UserConversationStats)
async def get_user_conversation_stats(
    user_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取用户对话统计

    Args:
        user_id: 用户ID

    Returns:
        用户对话统计数据

    Raises:
        HTTPException: 用户不存在时
    """
    # 验证用户存在
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    # 总对话数
    total_conv_result = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.user_id == user_id)
    )
    total_conversations = total_conv_result.scalar() or 0

    # 总消息数（通过对话表汇总）
    total_msg_result = await db.execute(
        select(func.sum(Conversation.message_count)).where(Conversation.user_id == user_id)
    )
    total_messages = total_msg_result.scalar() or 0

    # 按模型分类统计
    model_result = await db.execute(
        select(Conversation.model_name, func.count(Conversation.id))
        .where(Conversation.user_id == user_id)
        .where(Conversation.model_name.isnot(None))
        .group_by(Conversation.model_name)
    )
    model_breakdown = {row[0]: row[1] for row in model_result.all()}

    # 最近活动时间
    last_activity_result = await db.execute(
        select(func.max(Conversation.updated_at)).where(Conversation.user_id == user_id)
    )
    last_activity = last_activity_result.scalar()

    # 最活跃的日期（对话数最多的日期）
    activity_result = await db.execute(
        select(cast(Conversation.created_at, Date), func.count(Conversation.id))
        .where(Conversation.user_id == user_id)
        .group_by(cast(Conversation.created_at, Date))
        .order_by(func.count(Conversation.id).desc())
        .limit(1)
    )
    most_active_row = activity_result.first()
    most_active_day = str(most_active_row[0]) if most_active_row else None

    return UserConversationStats(
        total_conversations=total_conversations,
        total_messages=total_messages,
        model_breakdown=model_breakdown,
        last_activity=last_activity,
        most_active_day=most_active_day,
    )


@router.get("/users/{user_id}/conversation-timeline", response_model=ConversationTimelineResponse)
async def get_user_conversation_timeline(
    user_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取用户对话时间线（按天分组）

    Args:
        user_id: 用户ID
        page: 页码
        page_size: 每页天数

    Returns:
        对话时间线响应

    Raises:
        HTTPException: 用户不存在时
    """
    # 验证用户存在
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    # 获取所有不同日期的对话统计
    date_query = (
        select(
            cast(Conversation.created_at, Date).label("date"),
            func.count(Conversation.id).label("conv_count"),
            func.sum(Conversation.message_count).label("msg_count"),
        )
        .where(Conversation.user_id == user_id)
        .group_by(cast(Conversation.created_at, Date))
        .order_by(desc(cast(Conversation.created_at, Date)))
    )

    # 获取总日期数
    count_result = await db.execute(
        select(func.count(func.distinct(cast(Conversation.created_at, Date))))
        .where(Conversation.user_id == user_id)
    )
    total_days = count_result.scalar() or 0

    # 分页
    date_query = date_query.offset((page - 1) * page_size).limit(page_size)
    date_result = await db.execute(date_query)
    date_rows = date_result.all()

    # 构建时间线（批量取对话，避免 N+1）
    timeline = []
    date_values = [row[0] for row in date_rows]
    conversations_by_date: dict[str, list[AdminConversationResponse]] = {}

    if date_values:
        convs_result = await db.execute(
            select(
                Conversation,
                User.email,
                User.nickname,
                User.tags,
                cast(Conversation.created_at, Date).label("created_date"),
            )
            .outerjoin(User, Conversation.user_id == User.id)
            .where(Conversation.user_id == user_id)
            .where(cast(Conversation.created_at, Date).in_(date_values))
            .order_by(Conversation.created_at.desc())
        )
        for conv, user_email, user_nickname, user_tags, created_date in convs_result.all():
            date_key = str(created_date)
            conversations_by_date.setdefault(date_key, []).append(
                _build_admin_conversation_response(conv, user_email, user_nickname, user_tags)
            )

    for date_obj, conv_count, msg_count in date_rows:
        date_str = str(date_obj)
        conversations = conversations_by_date.get(date_str, [])
        timeline.append(
            ConversationTimelineItem(
                date=date_str,
                conversation_count=conv_count,
                message_count=int(msg_count) if msg_count else 0,
                conversations=conversations,
            )
        )

    return ConversationTimelineResponse(
        timeline=timeline,
        total=total_days,
        page=page,
        page_size=page_size,
    )


# ============ 对话清理管理 ============


@router.post("/conversations/cleanup")
async def cleanup_conversations(
    dry_run: bool = Query(False, description="试运行，不实际删除"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    手动清理超过14天的对话

    Args:
        dry_run: 是否为试运行

    Returns:
        清理结果
    """
    from app.services.conversation_cleanup import cleanup_old_conversations

    result = await cleanup_old_conversations(db, dry_run=dry_run)
    logger.info("Admin %s triggered conversation cleanup (dry_run=%s)", admin.email, dry_run)
    return result


@router.get("/conversations/cleanup-history")
async def get_conversation_cleanup_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取对话清理历史记录

    Args:
        page: 页码
        page_size: 每页数量

    Returns:
        清理历史记录
    """
    from app.services.conversation_cleanup import get_cleanup_history as fetch_history

    records, total = await fetch_history(db, page, page_size)
    return {
        "records": records,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/conversations/cleanup-stats")
async def get_cleanup_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取清理统计信息

    Returns:
        清理统计数据
    """
    from app.services.conversation_cleanup import get_cutoff_time, RETENTION_DAYS
    from app.models.conversation_cleanup import ConversationCleanup

    cutoff_time = get_cutoff_time()

    # 统计总清理次数
    total_cleanup_result = await db.execute(select(func.count(ConversationCleanup.id)))
    total_cleanup = total_cleanup_result.scalar() or 0

    # 统计总删除对话数和消息数
    stats_result = await db.execute(
        select(
            func.count(ConversationCleanup.id).label('conversations'),
            func.sum(ConversationCleanup.message_count).label('messages')
        )
    )
    stats = stats_result.first()

    # 最近一次清理时间
    recent_result = await db.execute(
        select(ConversationCleanup)
        .order_by(desc(ConversationCleanup.cleaned_at))
        .limit(1)
    )
    recent_cleanup = recent_result.scalar_one_or_none()

    return {
        "retention_days": RETENTION_DAYS,
        "cutoff_time": cutoff_time.strftime('%Y-%m-%d %H:%M:%S %Z'),
        "total_cleanup_records": total_cleanup,
        "total_conversations_deleted": stats.conversations if stats else 0,
        "total_messages_deleted": int(stats.messages) if stats and stats.messages else 0,
        "last_cleanup_time": recent_cleanup.cleaned_at.strftime('%Y-%m-%d %H:%M:%S') if recent_cleanup else None,
    }
