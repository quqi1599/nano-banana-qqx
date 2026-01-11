"""
对话历史路由
"""
import json
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.conversation import Conversation, ConversationMessage
from app.schemas.conversation import (
    ConversationCreate,
    ConversationUpdate,
    ConversationResponse,
    ConversationDetailResponse,
    ConversationMessagesResponse,
    MessageCreate,
    MessageResponse,
)
from app.utils.security import get_current_user

router = APIRouter(prefix="/conversations", tags=["conversations"])


def generate_title(content: str, max_length: int = 50) -> str:
    """根据对话内容生成标题"""
    # 移除换行和多余空格
    title = content.strip().replace("\n", " ")
    # 截取前N个字符
    if len(title) > max_length:
        title = title[:max_length] + "..."
    return title or "新对话"


@router.post("", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建新对话"""
    conversation = Conversation(
        user_id=current_user.id,
        title=data.title,
        model_name=data.model_name,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.get("", response_model=List[ConversationResponse])
async def get_conversations(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int | None = Query(None, ge=1),
    page_size: int | None = Query(None, ge=1, le=100),
):
    """获取当前用户的对话列表"""
    query = (
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(desc(Conversation.updated_at))
    )

    if page is not None or page_size is not None:
        resolved_page = page or 1
        resolved_page_size = page_size or 20
        count_result = await db.execute(
            select(func.count(Conversation.id)).where(
                Conversation.user_id == current_user.id
            )
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取对话详情（含消息）"""
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(
            and_(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
            )
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    return conversation


@router.get("/{conversation_id}/messages", response_model=ConversationMessagesResponse)
async def get_conversation_messages(
    conversation_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取对话消息分页"""
    exists_result = await db.execute(
        select(Conversation.id).where(
            and_(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
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
        messages=messages,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def add_message(
    conversation_id: str,
    data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """向对话添加消息"""
    # 验证对话所有权
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
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

    # 如果是用户的第一条消息，且对话没有标题，自动生成标题
    if data.role == "user" and not conversation.title:
        conversation.title = generate_title(data.content)

    await db.commit()
    await db.refresh(message)
    return message


@router.put("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: str,
    data: ConversationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新对话标题"""
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除对话"""
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """清空对话消息（保留对话，用于重新开始）"""
    result = await db.execute(
        select(Conversation).where(
            and_(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
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
    await db.execute(
        select(ConversationMessage).where(
            ConversationMessage.conversation_id == conversation_id
        )
    )
    # 使用 delete() 直接删除
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
