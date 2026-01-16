"""
对话历史路由
"""
from datetime import datetime
from typing import List, Optional
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, func, or_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.conversation import Conversation, ConversationMessage
from app.models.visitor import Visitor
from app.schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    ConversationResponse,
    ConversationDetailResponse,
    ConversationMessagesResponse,
    MessageCreate,
    MessageResponse,
)
from app.utils.security import get_current_user_optional

router = APIRouter(prefix="/conversations", tags=["conversations"])


def generate_title(content: str, max_length: int = 50) -> str:
    """根据对话内容生成标题"""
    # 移除换行和多余空格
    title = content.strip().replace("\n", " ")
    # 截取前N个字符
    if len(title) > max_length:
        title = title[:max_length] + "..."
    return title or "新对话"


def _normalize_role(role: str) -> str:
    if role == "assistant":
        return "model"
    return role


def _parse_images(raw_images: Optional[str]) -> Optional[List[dict]]:
    if not raw_images:
        return None
    try:
        data = json.loads(raw_images)
    except (TypeError, ValueError):
        return None
    if not isinstance(data, list):
        return None
    normalized: List[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        base64 = item.get("base64")
        mime_type = item.get("mimeType")
        if not base64 or not mime_type:
            continue
        normalized.append({"base64": base64, "mimeType": mime_type})
    return normalized or None


def _serialize_message(message: ConversationMessage) -> MessageResponse:
    return MessageResponse(
        id=message.id,
        role=_normalize_role(message.role),
        content=message.content,
        images=_parse_images(message.images),
        is_thought=message.is_thought,
        thinking_duration=message.thinking_duration,
        created_at=message.created_at,
    )


def _should_merge_visitor_history(current_user: Optional[User]) -> bool:
    if not current_user:
        return False
    tags = current_user.tags or []
    return "api_key" in tags


def _get_conversation_filter(current_user: Optional[User], visitor_id: Optional[str]):
    if current_user:
        if visitor_id and _should_merge_visitor_history(current_user):
            return or_(
                Conversation.user_id == current_user.id,
                Conversation.visitor_id == visitor_id,
            )
        return Conversation.user_id == current_user.id
    if visitor_id:
        return Conversation.visitor_id == visitor_id
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="未登录且未提供游客标识",
    )


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-Id"),
    x_custom_endpoint: Optional[str] = Header(None, alias="X-Custom-Endpoint"),
    db: AsyncSession = Depends(get_db),
):
    """创建新对话"""
    if not current_user and not x_visitor_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="需要登录或提供游客标识以创建对话",
        )

    # 使用请求中的 custom_endpoint，如果没有则使用 data 中的
    custom_endpoint = x_custom_endpoint or data.custom_endpoint

    # 更新或创建 Visitor 记录
    if x_visitor_id:
        visitor_result = await db.execute(
            select(Visitor).where(Visitor.visitor_id == x_visitor_id)
        )
        visitor = visitor_result.scalar_one_or_none()
        if visitor:
            # 更新现有记录
            if custom_endpoint:
                visitor.custom_endpoint = custom_endpoint
            visitor.conversation_count += 1
            visitor.last_seen = datetime.utcnow()
        else:
            # 创建新记录
            new_visitor = Visitor(
                id=str(uuid.uuid4()),
                visitor_id=x_visitor_id,
                custom_endpoint=custom_endpoint,
                conversation_count=1,
                message_count=0,
                image_count=0,
            )
            db.add(new_visitor)

    conversation = Conversation(
        user_id=current_user.id if current_user else None,
        visitor_id=x_visitor_id if not current_user else None,
        title=data.title,
        model_name=data.model_name,
        custom_endpoint=custom_endpoint,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.get("", response_model=List[ConversationResponse])
async def get_conversations(
    response: Response,
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-Id"),
    db: AsyncSession = Depends(get_db),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1, le=100),
):
    """获取当前用户（或游客）的对话列表"""
    filters = _get_conversation_filter(current_user, x_visitor_id)
    query = (
        select(Conversation)
        .where(filters)
        .order_by(desc(Conversation.updated_at))
    )

    if page is not None or page_size is not None:
        resolved_page = page or 1
        resolved_page_size = page_size or 20
        count_result = await db.execute(
            select(func.count(Conversation.id)).where(filters)
        )
        total = count_result.scalar() or 0
        response.headers["X-Total-Count"] = str(total)
        query = query.offset(
            (resolved_page - 1) * resolved_page_size
        ).limit(resolved_page_size)

    result = await db.execute(query)
    conversations = result.scalars().all()
    return conversations


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conversation_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-Id"),
    db: AsyncSession = Depends(get_db),
):
    """获取对话详情（含消息）"""
    filters = _get_conversation_filter(current_user, x_visitor_id)
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(
            and_(
                Conversation.id == conversation_id,
                filters,
            )
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    messages = [_serialize_message(msg) for msg in conversation.messages]
    base = ConversationResponse.model_validate(conversation).model_dump()
    return ConversationDetailResponse(**base, messages=messages)


@router.get("/{conversation_id}/messages", response_model=ConversationMessagesResponse)
async def get_conversation_messages(
    conversation_id: str,
    response: Response,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-Id"),
    db: AsyncSession = Depends(get_db),
):
    """获取对话消息分页"""
    filters = _get_conversation_filter(current_user, x_visitor_id)
    exists_result = await db.execute(
        select(Conversation.id).where(
            and_(
                Conversation.id == conversation_id,
                filters,
            )
        )
    )
    if not exists_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    count_result = await db.execute(
        select(func.count(ConversationMessage.id)).where(
            ConversationMessage.conversation_id == conversation_id
        )
    )
    total = count_result.scalar() or 0
    response.headers["X-Total-Count"] = str(total)

    result = await db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    messages = result.scalars().all()

    return ConversationMessagesResponse(
        conversation_id=conversation_id,
        messages=[_serialize_message(msg) for msg in messages],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def add_message(
    conversation_id: str,
    data: MessageCreate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-Id"),
    db: AsyncSession = Depends(get_db),
):
    """向对话添加消息"""
    # 验证对话所有权
    filters = _get_conversation_filter(current_user, x_visitor_id)
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.id == conversation_id,
                filters,
            )
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    # 序列化图片
    images_json = None
    if data.images:
        images_json = json.dumps([img.model_dump() for img in data.images])

    # 创建消息
    message = ConversationMessage(
        conversation_id=conversation_id,
        role=data.role,
        content=data.content,
        images=images_json,
        is_thought=data.is_thought,
        thinking_duration=data.thinking_duration,
    )
    db.add(message)

    # 更新对话的标题和消息数量
    conversation.message_count += 1
    conversation.updated_at = datetime.utcnow()

    # 如果是游客且有 visitor_id，同步更新游客统计
    if x_visitor_id and conversation.visitor_id:
        visitor_result = await db.execute(
            select(Visitor).where(Visitor.visitor_id == conversation.visitor_id)
        )
        visitor = visitor_result.scalar_one_or_none()
        if visitor:
            visitor.message_count += 1
            # 计算图片数量
            image_count = 0
            if data.images:
                image_count = len(data.images)
            visitor.image_count += image_count
            visitor.last_seen = datetime.utcnow()

    # 如果是用户的第一条消息，且对话没有标题，自动生成标题
    if data.role == "user" and not conversation.title:
        conversation.title = generate_title(data.content)

    await db.commit()
    await db.refresh(message)
    return _serialize_message(message)


@router.put("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: str,
    data: ConversationUpdate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-Id"),
    db: AsyncSession = Depends(get_db),
):
    """更新对话标题"""
    filters = _get_conversation_filter(current_user, x_visitor_id)
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.id == conversation_id,
                filters,
            )
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    conversation.title = data.title
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-Id"),
    db: AsyncSession = Depends(get_db),
):
    """删除对话"""
    filters = _get_conversation_filter(current_user, x_visitor_id)
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.id == conversation_id,
                filters,
            )
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    await db.delete(conversation)
    await db.commit()
    return None


@router.delete("/{conversation_id}/messages", status_code=status.HTTP_204_NO_CONTENT)
async def clear_conversation_messages(
    conversation_id: str,
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-Id"),
    db: AsyncSession = Depends(get_db),
):
    """清空对话消息（保留对话，用于重新开始）"""
    filters = _get_conversation_filter(current_user, x_visitor_id)
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.id == conversation_id,
                filters,
            )
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    # 删除所有消息
    from sqlalchemy import delete
    await db.execute(
        delete(ConversationMessage).where(
            ConversationMessage.conversation_id == conversation_id
        )
    )

    # 重置对话状态
    conversation.message_count = 0
    conversation.title = None
    await db.commit()
    return None
