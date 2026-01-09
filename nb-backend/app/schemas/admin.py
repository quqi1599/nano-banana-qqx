"""
管理后台相关 Schemas
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


# Token 池管理
class TokenPoolCreate(BaseModel):
    """添加 Token 请求"""
    name: str
    api_key: str
    priority: int = 0


class TokenPoolResponse(BaseModel):
    """Token 信息响应"""
    id: str
    name: str
    api_key: str  # 仅显示部分
    remaining_quota: float
    is_active: bool
    priority: int
    total_requests: int
    last_used_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


class TokenPoolUpdate(BaseModel):
    """更新 Token"""
    name: Optional[str] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None


# 用户管理
class AdminUserResponse(BaseModel):
    """管理员查看的用户信息"""
    id: str
    email: str
    nickname: Optional[str]
    credit_balance: int
    is_admin: bool
    is_active: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    last_login_ip: Optional[str] = None
    note: Optional[str] = None
    total_usage: int = 0  # 总使用次数
    
    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """用户列表响应"""
    users: List[AdminUserResponse]
    total: int
    page: int
    page_size: int

class UserNoteUpdate(BaseModel):
    """更新备注"""
    note: Optional[str] = None


# 统计数据
class DailyStats(BaseModel):
    """每日统计"""
    date: str
    total_requests: int
    total_credits_used: int
    unique_users: int


class ModelStats(BaseModel):
    """模型使用统计"""
    model_name: str
    total_requests: int
    total_credits_used: int


class DashboardStats(BaseModel):
    """仪表盘统计"""
    total_users: int
    active_users_today: int
    total_credits_consumed: int
    total_requests_today: int
    token_pool_count: int
    available_tokens: int
    daily_stats: List[DailyStats]
    model_stats: List[ModelStats]
