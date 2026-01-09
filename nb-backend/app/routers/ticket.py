from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from typing import List
from uuid import UUID

from app.database import get_db
from app.models.ticket import Ticket, TicketMessage
from app.models.user import User
from app.schemas.ticket import (
    TicketCreate, TicketResponse, TicketDetailResponse, 
    TicketMessageCreate, TicketUpdate
)
from app.utils.security import get_current_user, get_admin_user as get_current_admin

router = APIRouter()

# ========== 用户端 API ==========

@router.post("/", response_model=TicketResponse)
async def create_ticket(
    ticket_in: TicketCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """创建新工单"""
    # 1. 创建工单
    new_ticket = Ticket(
        user_id=current_user.id,
        title=ticket_in.title,
        priority=ticket_in.priority
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
        
    # 填充消息发送者的邮箱信息 (schema转换需要)
    # Pydantic schema will extract data from ORM objects based on config
    # We loaded sender relationship, so message.sender.email should be available if we map it?
    # Alternatively we can enrich the response manually if needed.
    # For now relying on ORM relationship.
    
    return ticket

@router.post("/{ticket_id}/reply")
async def reply_ticket(
    ticket_id: str,
    msg_in: TicketMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """回复工单"""
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
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
             ticket.status = 'pending' # 等待用户回复
    else:
        # 用户回复，重新打开工单
        if ticket.status in ['resolved', 'pending']:
             ticket.status = 'open'
             
    await db.commit()
    return {"status": "success"}

# ========== 管理员 API ==========

@router.get("/admin/all", response_model=List[TicketResponse])
async def get_all_tickets(
    status_filter: str = None,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """管理员获取所有工单"""
    query = select(Ticket).options(selectinload(Ticket.user)).order_by(desc(Ticket.created_at))
    
    if status_filter and status_filter != 'all':
        query = query.where(Ticket.status == status_filter)
        
    result = await db.execute(query)
    tickets = result.scalars().all()
    
    # 手动填充 user_email，因为 Pydantic 模型里 TicketResponse 需要 user_email
    # 但 Ticket 模型没有这个字段，它只有 user 关系
    # 我们可以通过 Pydantic 的 validator 或者在这里转换
    # 简单起见，我们构造一个包含 user_email 的 dict 列表返回？
    # 或者让 Pydantic 从 user.email 获取？
    # Response model 的 user_email 字段如果定义了，并且 ORM 对象有 user relation
    # 我们需要在 response model 里加个 root_validator 或者 property
    
    # 这里的简单做法是直接返回，但在 Schema 里做个处理。
    # 为了方便，我们在 Schema 定义时没加 user_email source。
    # 让我们在 Schema 里加个 field validator 或者在此处转换。
    
    response_data = []
    for t in tickets:
        t_dict = t.__dict__.copy()
        if t.user:
            t_dict['user_email'] = t.user.email
        response_data.append(t_dict)
        
    return response_data

@router.put("/{ticket_id}/status")
async def update_ticket_status(
    ticket_id: str,
    status_in: TicketUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """管理员更新工单状态/优先级"""
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalars().first()
    
    if not ticket:
        raise HTTPException(status_code=404, detail="工单不存在")
        
    if status_in.status:
        ticket.status = status_in.status
    if status_in.priority:
        ticket.priority = status_in.priority
        
    await db.commit()
    return {"status": "success"}
