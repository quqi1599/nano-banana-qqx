"""
用户路由
"""
from fastapi import APIRouter, Depends
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate
from app.utils.security import get_current_user
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db

router = APIRouter()


@router.get("/profile", response_model=UserResponse)
@router.get("/self", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    """获取用户资料"""
    return UserResponse.model_validate(current_user)


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新用户资料"""
    if data.nickname is not None:
        current_user.nickname = data.nickname
    
    await db.commit()
    await db.refresh(current_user)
    
    return UserResponse.model_validate(current_user)
