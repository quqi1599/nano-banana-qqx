"""
通知邮箱管理 API
用于管理接收工单通知的邮箱列表
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import List, Optional

from app.database import get_db
from app.models.notification_email import NotificationEmail
from app.utils.security import get_admin_user

router = APIRouter()


# ========== Schemas ==========

class NotificationEmailCreate(BaseModel):
    email: EmailStr
    remark: Optional[str] = None


class NotificationEmailResponse(BaseModel):
    id: str
    email: str
    remark: Optional[str]
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


# ========== API Endpoints ==========

@router.get("/", response_model=List[NotificationEmailResponse])
async def get_notification_emails(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_admin_user)
):
    """获取所有通知邮箱"""
    result = await db.execute(
        select(NotificationEmail).order_by(NotificationEmail.created_at.desc())
    )
    emails = result.scalars().all()
    return [
        NotificationEmailResponse(
            id=e.id,
            email=e.email,
            remark=e.remark,
            is_active=e.is_active,
            created_at=e.created_at.isoformat() if e.created_at else ""
        )
        for e in emails
    ]


@router.post("/", response_model=NotificationEmailResponse)
async def add_notification_email(
    data: NotificationEmailCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_admin_user)
):
    """添加通知邮箱"""
    # 检查是否已存在
    existing = await db.execute(
        select(NotificationEmail).where(NotificationEmail.email == data.email.lower())
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="该邮箱已存在")

    new_email = NotificationEmail(
        email=data.email.lower(),
        remark=data.remark
    )
    db.add(new_email)
    await db.commit()
    await db.refresh(new_email)

    return NotificationEmailResponse(
        id=new_email.id,
        email=new_email.email,
        remark=new_email.remark,
        is_active=new_email.is_active,
        created_at=new_email.created_at.isoformat() if new_email.created_at else ""
    )


@router.delete("/{email_id}")
async def delete_notification_email(
    email_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_admin_user)
):
    """删除通知邮箱"""
    result = await db.execute(
        select(NotificationEmail).where(NotificationEmail.id == email_id)
    )
    email = result.scalars().first()

    if not email:
        raise HTTPException(status_code=404, detail="邮箱不存在")

    await db.delete(email)
    await db.commit()

    return {"message": "删除成功"}


@router.put("/{email_id}/toggle")
async def toggle_notification_email(
    email_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_admin_user)
):
    """切换通知邮箱启用状态"""
    result = await db.execute(
        select(NotificationEmail).where(NotificationEmail.id == email_id)
    )
    email = result.scalars().first()

    if not email:
        raise HTTPException(status_code=404, detail="邮箱不存在")

    email.is_active = not email.is_active
    await db.commit()

    return {"message": "状态已更新", "is_active": email.is_active}
