"""
管理后台相关 Schemas
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List, Literal


# Token 池管理
class TokenPoolCreate(BaseModel):
    """添加 Token 请求"""
    name: str
    api_key: str
    priority: int = 0
    base_url: Optional[str] = None


class TokenPoolResponse(BaseModel):
    """Token 信息响应"""
    id: str
    name: str
    api_key: str  # 仅显示部分
    base_url: Optional[str] = None
    remaining_quota: float
    is_active: bool
    failure_count: int = 0
    cooldown_until: Optional[datetime] = None
    last_failure_at: Optional[datetime] = None
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
    base_url: Optional[str] = None


# 模型计费
class ModelPricingCreate(BaseModel):
    """创建模型计费"""
    model_name: str
    credits_per_request: int


class ModelPricingUpdate(BaseModel):
    """更新模型计费"""
    credits_per_request: int


class ModelPricingResponse(BaseModel):
    """模型计费响应"""
    id: str
    model_name: str
    credits_per_request: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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
    tags: list[str] = []
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


class UserTagsUpdate(BaseModel):
    """更新用户标签"""
    tags: list[str]


class UserTagsResponse(BaseModel):
    """所有用户标签列表"""
    tags: list[str]
    counts: dict[str, int]  # 每个标签的用户数


class AdminActionConfirmRequest(BaseModel):
    """管理员敏感操作二次确认"""
    purpose: Literal["batch_status", "batch_credits"]
    password: str


class AdminActionConfirmResponse(BaseModel):
    """管理员敏感操作二次确认响应"""
    confirm_token: str
    expires_in: int


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


class UserGrowthStats(BaseModel):
    """用户增长统计"""
    date: str
    new_users: int
    total_users: int


class DashboardStats(BaseModel):
    """仪表盘统计"""
    total_users: int
    active_users_today: int
    total_credits_consumed: int
    total_requests_today: int
    token_pool_count: int
    available_tokens: int
    today_credits_used: int = 0  # 今日消耗积分
    today_image_calls: int = 0   # 今日图片调用次数
    daily_stats: List[DailyStats]
    model_stats: List[ModelStats]
    user_growth: List[UserGrowthStats] = []  # 用户增长趋势


# 邮件配置管理
class EmailConfigResponse(BaseModel):
    """邮件配置响应"""
    id: str
    email_type: str
    email_type_label: str = ""
    from_name: str
    from_email: Optional[str] = None
    subject_template: Optional[str] = None
    is_enabled: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmailConfigUpdate(BaseModel):
    """更新邮件配置"""
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    subject_template: Optional[str] = None
    is_enabled: Optional[bool] = None


class SmtpConfigResponse(BaseModel):
    """SMTP配置响应"""
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    from_name: str = ""
    is_configured: bool = False


class SmtpConfigUpdate(BaseModel):
    """更新SMTP配置"""
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_password: Optional[str] = None
    from_name: Optional[str] = None


# ============ 用户管理扩展 Schemas ============

class UserStatsResponse(BaseModel):
    """用户统计概览"""
    total_users: int
    new_today: int
    disabled_count: int
    paid_users: int  # 有余额的用户数


class UserStatusUpdate(BaseModel):
    """用户状态更新请求"""
    is_active: bool
    reason: str = Field(min_length=4, max_length=200)  # 必填：操作原因


class BatchStatusUpdate(BaseModel):
    """批量状态更新请求"""
    user_ids: List[str]
    is_active: bool
    reason: str = Field(min_length=4, max_length=200)  # 必填：操作原因
    confirm_token: str = Field(min_length=12, max_length=200)


class BatchCreditsUpdate(BaseModel):
    """批量积分调整请求"""
    user_ids: List[str]
    amount: int
    reason: str = Field(min_length=4, max_length=200)  # 必填：操作原因
    confirm_token: str = Field(min_length=12, max_length=200)


class CreditHistoryItem(BaseModel):
    """积分调整历史项"""
    id: str
    amount: int
    type: str
    description: Optional[str]
    balance_after: int
    created_at: datetime

    class Config:
        from_attributes = True


class CreditHistoryResponse(BaseModel):
    """积分调整历史响应"""
    items: List[CreditHistoryItem]
    total: int


class UsageLogItem(BaseModel):
    """用户积分消耗明细项"""
    id: str
    model_name: str
    credits_used: int
    request_type: str
    prompt_preview: Optional[str]
    is_success: bool
    error_message: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class UsageLogResponse(BaseModel):
    """用户积分消耗明细响应"""
    items: List[UsageLogItem]
    total: int
    page: int
    page_size: int


# ============ 用户对话历史管理 Schemas ============

from app.schemas.conversation import AdminConversationResponse


class UserConversationStats(BaseModel):
    """用户对话统计"""
    total_conversations: int
    total_messages: int
    model_breakdown: dict[str, int]  # 模型 -> 对话数
    last_activity: Optional[datetime] = None
    most_active_day: Optional[str] = None  # 最活跃的日期


class ConversationTimelineItem(BaseModel):
    """时间线项（按天分组）"""
    date: str  # YYYY-MM-DD
    conversation_count: int
    message_count: int
    conversations: List[AdminConversationResponse]


class ConversationTimelineResponse(BaseModel):
    """时间线响应"""
    timeline: List[ConversationTimelineItem]
    total: int
    page: int
    page_size: int


class ConversationListResponse(BaseModel):
    """对话列表响应（带总数）"""
    conversations: List[AdminConversationResponse]
    total: int
    page: int
    page_size: int
