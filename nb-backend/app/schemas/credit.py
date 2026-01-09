"""
积分相关 Schemas
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class CreditBalance(BaseModel):
    """积分余额"""
    balance: int
    

class CreditTransactionResponse(BaseModel):
    """积分交易记录响应"""
    id: str
    amount: int
    type: str
    description: Optional[str]
    balance_after: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class CreditHistoryResponse(BaseModel):
    """积分历史列表响应"""
    transactions: List[CreditTransactionResponse]
    total: int
    page: int
    page_size: int
