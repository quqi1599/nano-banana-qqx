from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from uuid import UUID

# Message Schemas
class TicketMessageBase(BaseModel):
    content: str

class TicketMessageCreate(TicketMessageBase):
    pass

class TicketMessageResponse(TicketMessageBase):
    id: str
    sender_id: str
    is_admin: bool
    created_at: datetime
    
    sender_email: Optional[str] = None  # 辅助字段，用于显示发送者邮箱

    class Config:
        from_attributes = True

# Ticket Schemas
class TicketBase(BaseModel):
    title: str
    priority: str = Field(default="normal", pattern="^(low|normal|high)$")

class TicketCreate(TicketBase):
    content: str  # 创建工单时的第一条消息

class TicketUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern="^(open|pending|resolved|closed)$")
    priority: Optional[str] = Field(None, pattern="^(low|normal|high)$")

class TicketResponse(TicketBase):
    id: str
    user_id: str
    status: str
    created_at: datetime
    updated_at: datetime
    
    user_email: Optional[str] = None # 用于管理员列表显示用户
    
    class Config:
        from_attributes = True

class TicketDetailResponse(TicketResponse):
    messages: List[TicketMessageResponse] = []
