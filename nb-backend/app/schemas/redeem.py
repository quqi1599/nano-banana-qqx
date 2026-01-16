"""
兑换码相关 Schemas
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class RedeemRequest(BaseModel):
    """兑换码兑换请求"""
    code: str


class RedeemResponse(BaseModel):
    """兑换结果响应"""
    success: bool
    message: str
    credits_added: int  # 增加的通用积分
    pro3_credits_added: int  # 增加的 Pro3 次数
    flash_credits_added: int  # 增加的 Flash 次数
    new_balance: int  # 通用积分余额（兼容字段）
    general_balance: int  # 通用积分余额
    pro3_balance: int  # Pro3 次数余额
    flash_balance: int  # Flash 次数余额
    total_balance: int  # 总余额（通用 + Pro3 + Flash）


class UserBalanceInfo(BaseModel):
    """用户余额信息"""
    general_balance: int  # 通用积分余额
    pro3_balance: int  # Pro3 次数余额
    flash_balance: int  # Flash 次数余额


class RedeemCodeInfo(BaseModel):
    """兑换码信息"""
    id: str
    code: str
    credit_amount: int  # 通用积分
    pro3_credits: int  # Pro3 次数
    flash_credits: int  # Flash 次数
    remark: Optional[str]
    is_used: bool
    used_at: Optional[datetime]
    expires_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateCodesRequest(BaseModel):
    """批量生成兑换码请求"""
    count: int = 10
    credit_amount: int = 0  # 通用积分数量
    pro3_credits: int = 0  # Pro3 次数
    flash_credits: int = 0  # Flash 次数
    remark: Optional[str] = None  # 备注
    expires_days: Optional[int] = None  # 有效期天数（留空为永久）


class GenerateCodesResponse(BaseModel):
    """批量生成兑换码响应"""
    batch_id: str
    codes: List[str]
    count: int
    credit_amount: int
    pro3_credits: int
    flash_credits: int
    remark: Optional[str] = None
