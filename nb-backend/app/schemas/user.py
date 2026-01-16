"""
用户相关 Schemas
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime
from typing import Optional


class UserRegister(BaseModel):
    """用户注册请求"""
    email: EmailStr
    password: str
    nickname: Optional[str] = Field(default=None, max_length=32)

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            return None
        if "<" in cleaned or ">" in cleaned:
            raise ValueError("昵称包含非法字符")
        return cleaned


class UserLogin(BaseModel):
    """用户登录请求"""
    email: EmailStr
    password: str
    captcha_ticket: str


class UserResponse(BaseModel):
    """用户信息响应"""
    id: str
    email: str
    nickname: Optional[str]
    credit_balance: int
    is_admin: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """登录令牌响应"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserUpdate(BaseModel):
    """更新用户信息"""
    nickname: Optional[str] = Field(default=None, max_length=32)

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            return None
        if "<" in cleaned or ">" in cleaned:
            raise ValueError("昵称包含非法字符")
        return cleaned
