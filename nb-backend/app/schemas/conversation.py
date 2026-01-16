"""
对话相关的 Pydantic Schemas
"""
from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class MessageImage(BaseModel):
    """消息图片"""
    base64: str
    mimeType: str


class MessageCreate(BaseModel):
    """创建消息请求"""
    role: str = Field(..., pattern="^(user|assistant|system|model)$")
    content: str
    images: Optional[List[MessageImage]] = None
    is_thought: bool = False
    thinking_duration: Optional[int] = None


class MessageResponse(BaseModel):
    """消息响应"""
    id: str
    role: str
    content: str
    images: Optional[List[MessageImage]] = None
    is_thought: bool
    thinking_duration: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationCreate(BaseModel):
    """创建对话请求"""
    title: Optional[str] = None
    model_name: Optional[str] = None
    custom_endpoint: Optional[str] = None


class ConversationUpdate(BaseModel):
    """更新对话请求"""
    title: str


class ConversationResponse(BaseModel):
    """对话响应"""
    id: str
    user_id: Optional[str] = None
    visitor_id: Optional[str] = None
    title: Optional[str] = None
    model_name: Optional[str] = None
    message_count: int
    created_at: datetime
    updated_at: datetime
    custom_endpoint: Optional[str] = None

    class Config:
        from_attributes = True


class ConversationDetailResponse(ConversationResponse):
    """对话详情响应（含消息）"""
    messages: List[MessageResponse] = []


class ConversationMessagesResponse(BaseModel):
    """对话消息分页响应"""
    conversation_id: str
    messages: List[MessageResponse]
    total: int
    page: int
    page_size: int


UserType = Literal["user", "api_key", "visitor"]


class AdminConversationResponse(ConversationResponse):
    """管理员对话响应（含用户信息）"""
    user_email: Optional[str] = None
    user_nickname: Optional[str] = None
    user_type: UserType
    uses_custom_endpoint: bool = False
    custom_endpoint: Optional[str] = None


class AdminConversationDetailResponse(AdminConversationResponse):
    """管理员对话详情响应（含消息）"""
    messages: List[MessageResponse] = []
