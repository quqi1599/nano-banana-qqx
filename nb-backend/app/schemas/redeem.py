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
    credits_added: int
    new_balance: int
    

class RedeemCodeInfo(BaseModel):
    """兑换码信息"""
    id: str
    code: str
    credit_amount: int
    is_used: bool
    used_at: Optional[datetime]
    expires_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


class GenerateCodesRequest(BaseModel):
    """批量生成兑换码请求"""
    count: int = 10
    credit_amount: int = 100
    expires_days: Optional[int] = 365  # 有效期天数


class GenerateCodesResponse(BaseModel):
    """批量生成兑换码响应"""
    batch_id: str
    codes: List[str]
    count: int
    credit_amount: int
