from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, update
from sqlalchemy.orm import selectinload
from typing import List

from app.database import get_db
from app.models.ticket import Ticket, TicketMessage
from app.models.user import User
from app.schemas.ticket import (
    TicketCreate, TicketResponse, TicketDetailResponse,
    TicketMessageCreate, TicketUpdate, TicketResponse as TicketResponseSchema
)
from app.utils.security import get_current_user, get_admin_user as get_current_admin
from app.services.email_service import (
    send_ticket_reply_notification,
    send_new_ticket_notification,
    send_ticket_user_reply_notification
)
from app.config import get_settings
from app.models.notification_email import NotificationEmail

settings = get_settings()
router = APIRouter()

# 获取管理员通知邮箱列表（从数据库优先，回退到环境变量）
async def get_admin_emails(db: AsyncSession) -> List[str]:
    """获取管理员通知邮箱列表"""
    # 优先从数据库读取已启用的通知邮箱
    result = await db.execute(
        select(NotificationEmail.email).where(NotificationEmail.is_active == True)
    )
    db_emails = [row[0] for row in result.fetchall()]
    if db_emails:
        return db_emails

    # 回退到环境变量配置
    if settings.admin_notification_emails:
        return [e.strip() for e in settings.admin_notification_emails.split(',') if e.strip()]
    return settings.admin_emails_list

# ========== 用户端 API ==========

@router.post("/", response_model=TicketResponse)
async def create_ticket(
    ticket_in: TicketCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """创建新工单"""
    # 检查用户在线工单数量（仅统计 open 和 pending 状态，resolved 和 closed 不计入）
    active_count_query = select(func.count(Ticket.id)).where(
        Ticket.user_id == current_user.id,
        Ticket.status.in_(['open', 'pending'])
    )
    active_count_result = await db.execute(active_count_query)
    active_count = active_count_result.scalar() or 0

    if active_count >= 3:
        raise HTTPException(
            status_code=429,
            detail=f"您已有 {active_count} 条在线工单，最多允许 3 条。已解决或已关闭的工单不计入限制。"
        )

    # 1. 创建工单
    new_ticket = Ticket(
        user_id=current_user.id,
        title=ticket_in.title,
        priority=ticket_in.priority,
        category=ticket_in.category
    )
    db.add(new_ticket)
    await db.flush()  # 获取 ID

    # 2. 创建第一条消息
    first_msg = TicketMessage(
        ticket_id=new_ticket.id,
        sender_id=current_user.id,
        content=ticket_in.content,
        is_admin=False
    )
    db.add(first_msg)
    await db.commit()
    await db.refresh(new_ticket)

    # 3. 通知管理员（包含用户积分信息）
    admin_emails = await get_admin_emails(db)
    if admin_emails:
        background_tasks.add_task(
            send_new_ticket_notification,
            admin_emails,
            str(new_ticket.id),
            new_ticket.title,
            new_ticket.category,
            new_ticket.priority,
            current_user.email,
            ticket_in.content,
            current_user.credit_balance,
            current_user.pro3_balance,
            current_user.flash_balance
        )

    return new_ticket

@router.get("/", response_model=List[TicketResponse])
async def get_my_tickets(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取我的工单列表"""
    query = select(Ticket).where(Ticket.user_id == current_user.id).order_by(desc(Ticket.created_at))
    result = await db.execute(query)
    tickets = result.scalars().all()
    return tickets

@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户未读消息数量（管理员回复但用户未读的消息）"""
    # 获取用户的所有工单 ID
    ticket_ids_query = select(Ticket.id).where(Ticket.user_id == current_user.id)
    ticket_ids_result = await db.execute(ticket_ids_query)
    ticket_ids = [row[0] for row in ticket_ids_result.fetchall()]

    if not ticket_ids:
        return {"unread_count": 0}

    # 统计这些工单中未读的管理员回复
    unread_query = select(func.count(TicketMessage.id)).where(
        TicketMessage.ticket_id.in_(ticket_ids),
        TicketMessage.is_admin == True,
        TicketMessage.is_read == False
    )
    unread_result = await db.execute(unread_query)
    unread_count = unread_result.scalar() or 0

    return {"unread_count": unread_count}

@router.get("/mark-read/{ticket_id}")
async def mark_ticket_read(
    ticket_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """标记工单中所有管理员回复为已读"""
    # 验证工单属于当前用户
    ticket_query = select(Ticket).where(Ticket.id == ticket_id, Ticket.user_id == current_user.id)
    ticket_result = await db.execute(ticket_query)
    ticket = ticket_result.scalars().first()

    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")

    # 标记所有管理员回复为已读
    update_stmt = update(TicketMessage).where(
        TicketMessage.ticket_id == ticket_id,
        TicketMessage.is_admin == True,
        TicketMessage.is_read == False
    ).values(is_read=True)

    await db.execute(update_stmt)
    await db.commit()

    return {"status": "success"}

@router.get("/{ticket_id}", response_model=TicketDetailResponse)
async def get_ticket_detail(
    ticket_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取工单详情"""
    query = select(Ticket).where(Ticket.id == ticket_id).options(
        selectinload(Ticket.messages).selectinload(TicketMessage.sender)
    )
    result = await db.execute(query)
    ticket = result.scalars().first()

    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")

    # 权限检查：只能看自己的，或者是管理员
    if ticket.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="无权访问")

    # 自动标记未读消息为已读
    if current_user.is_admin:
        # 管理员查看：标记用户发送的未读消息为已读
        await db.execute(
            update(TicketMessage).where(
                TicketMessage.ticket_id == ticket_id,
                TicketMessage.is_admin == False,
                TicketMessage.is_read == False
            ).values(is_read=True)
        )
    else:
        # 用户查看：标记管理员发送的未读消息为已读
        await db.execute(
            update(TicketMessage).where(
                TicketMessage.ticket_id == ticket_id,
                TicketMessage.is_admin == True,
                TicketMessage.is_read == False
            ).values(is_read=True)
        )
    await db.commit()

    return ticket

@router.post("/{ticket_id}/reply")
async def reply_ticket(
    ticket_id: str,
    msg_in: TicketMessageCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """回复工单"""
    result = await db.execute(
        select(Ticket).where(Ticket.id == ticket_id).options(selectinload(Ticket.user))
    )
    ticket = result.scalars().first()

    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")

    if ticket.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="无权操作")

    # 如果是管理员回复，更新状态为 resolved (或者 pending user response)
    # 如果是用户回复，更新状态为 open (pending admin)

    is_admin_reply = current_user.is_admin

    # 创建消息
    new_msg = TicketMessage(
        ticket_id=ticket.id,
        sender_id=current_user.id,
        content=msg_in.content,
        is_admin=is_admin_reply
    )
    db.add(new_msg)

    # 自动更新状态逻辑
    if is_admin_reply:
        if ticket.status == 'open':
            ticket.status = 'pending'  # 等待用户回复

        # 更新管理员最后回复时间（用于自动关闭）
        ticket.last_admin_reply_at = datetime.utcnow()

        # 发送邮件通知用户
        if ticket.user and ticket.user.email:
            background_tasks.add_task(
                send_ticket_reply_notification,
                ticket.user.email,
                ticket.title,
                msg_in.content
            )
    else:
        # 用户回复，重新打开工单
        if ticket.status in ['resolved', 'pending']:
             ticket.status = 'open'

        # 通知管理员用户回复了工单
        admin_emails = await get_admin_emails(db)
        if admin_emails:
            background_tasks.add_task(
                send_ticket_user_reply_notification,
                admin_emails,
                str(ticket.id),
                ticket.title,
                current_user.email,
                msg_in.content
            )

    await db.commit()
    return {"status": "success"}

@router.post("/{ticket_id}/close")
async def close_ticket(
    ticket_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """用户关闭自己的工单"""
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalars().first()

    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")

    # 只有工单创建者可以关闭
    if ticket.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="只能关闭自己的工单")

    # 只有 open 或 pending 状态可以关闭
    if ticket.status not in ['open', 'pending']:
        raise HTTPException(status_code=400, detail="该工单状态不允许关闭")

    ticket.status = 'closed'
    await db.commit()
    return {"status": "success", "message": "工单已关闭"}

# ========== 管理员 API ==========

@router.get("/admin/unread-count")
async def get_admin_unread_count(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """获取管理员未读消息数量（用户回复但管理员未读的消息）"""
    # 统计所有工单中未读的用户回复
    unread_query = select(func.count(TicketMessage.id)).where(
        TicketMessage.is_admin == False,
        TicketMessage.is_read == False
    )
    unread_result = await db.execute(unread_query)
    unread_count = unread_result.scalar() or 0

    return {"unread_count": unread_count}

@router.get("/admin/all", response_model=List[TicketResponse])
async def get_all_tickets(
    status_filter: str = None,
    category_filter: str = None,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """管理员获取所有工单"""
    query = select(Ticket).options(selectinload(Ticket.user)).order_by(desc(Ticket.created_at))

    if status_filter and status_filter != 'all':
        query = query.where(Ticket.status == status_filter)
    if category_filter and category_filter != 'all':
        query = query.where(Ticket.category == category_filter)

    result = await db.execute(query)
    tickets = result.scalars().all()

    # 使用 Pydantic 的 model_validate 安全地构建响应
    response_data = []
    for t in tickets:
        ticket_dict = TicketResponseSchema.model_validate(t).model_dump()
        if t.user:
            ticket_dict['user_email'] = t.user.email
        response_data.append(ticket_dict)

    return response_data

@router.put("/{ticket_id}/status")
async def update_ticket_status(
    ticket_id: str,
    status_in: TicketUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """管理员更新工单状态/优先级/分类"""
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalars().first()
    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")

    if status_in.status:
        ticket.status = status_in.status
    if status_in.priority:
        ticket.priority = status_in.priority
    if status_in.category:
        ticket.category = status_in.category

    await db.commit()
    return {"status": "success"}
