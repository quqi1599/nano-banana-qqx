"""
游客相关的 Pydantic Schemas
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class VisitorResponse(BaseModel):
    """游客响应"""
    id: str
    visitor_id: str
    custom_endpoint: Optional[str] = None
    conversation_count: int
    message_count: int
    image_count: int
    first_seen: datetime
    last_seen: datetime

    class Config:
        from_attributes = True


class VisitorListResponse(BaseModel):
    """游客列表响应"""
    visitors: List[VisitorResponse]
    total: int
    page: int
    page_size: int


class VisitorFilters(BaseModel):
    """游客筛选条件"""
    search: Optional[str] = None  # 搜索 visitor_id 或 custom_endpoint
    endpoint: Optional[str] = None  # 按端点筛选
    min_conversations: Optional[int] = None
    min_messages: Optional[int] = None
    min_images: Optional[int] = None
    first_seen_after: Optional[str] = None
    first_seen_before: Optional[str] = None


class VisitorStatsResponse(BaseModel):
    """游客统计响应"""
    total_visitors: int
    total_conversations: int
    total_messages: int
    total_images: int
    top_endpoints: List[dict]  # [{endpoint: str, count: int}]
