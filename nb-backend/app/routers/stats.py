"""
统计路由
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date

from app.database import get_db
from app.models.user import User
from app.models.token_pool import TokenPool
from app.models.usage_log import UsageLog
from app.schemas.admin import DashboardStats, DailyStats, ModelStats
from app.utils.security import get_admin_user

router = APIRouter()


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取仪表盘统计数据"""
    today = datetime.utcnow().date()
    
    # 总用户数
    total_users_result = await db.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar() or 0
    
    # 今日活跃用户
    active_users_result = await db.execute(
        select(func.count(func.distinct(UsageLog.user_id))).where(
            cast(UsageLog.created_at, Date) == today
        )
    )
    active_users_today = active_users_result.scalar() or 0
    
    # 今日请求数
    today_requests_result = await db.execute(
        select(func.count(UsageLog.id)).where(
            cast(UsageLog.created_at, Date) == today
        )
    )
    total_requests_today = today_requests_result.scalar() or 0
    
    # 总消耗积分
    total_credits_result = await db.execute(
        select(func.sum(UsageLog.credits_used))
    )
    total_credits_consumed = total_credits_result.scalar() or 0
    
    # Token 池信息
    token_count_result = await db.execute(select(func.count(TokenPool.id)))
    token_pool_count = token_count_result.scalar() or 0
    
    available_tokens_result = await db.execute(
        select(func.count(TokenPool.id)).where(
            TokenPool.is_active == True,
            TokenPool.remaining_quota > 0,
        )
    )
    available_tokens = available_tokens_result.scalar() or 0
    
    # 近7天每日统计
    daily_stats = []
    for i in range(6, -1, -1):
        date = today - timedelta(days=i)
        
        daily_result = await db.execute(
            select(
                func.count(UsageLog.id),
                func.sum(UsageLog.credits_used),
                func.count(func.distinct(UsageLog.user_id)),
            ).where(cast(UsageLog.created_at, Date) == date)
        )
        row = daily_result.one()
        
        daily_stats.append(DailyStats(
            date=date.isoformat(),
            total_requests=row[0] or 0,
            total_credits_used=row[1] or 0,
            unique_users=row[2] or 0,
        ))
    
    # 模型使用统计
    model_result = await db.execute(
        select(
            UsageLog.model_name,
            func.count(UsageLog.id),
            func.sum(UsageLog.credits_used),
        ).group_by(UsageLog.model_name)
    )
    model_rows = model_result.all()
    
    model_stats = [
        ModelStats(
            model_name=row[0],
            total_requests=row[1] or 0,
            total_credits_used=row[2] or 0,
        )
        for row in model_rows
    ]
    
    return DashboardStats(
        total_users=total_users,
        active_users_today=active_users_today,
        total_credits_consumed=total_credits_consumed,
        total_requests_today=total_requests_today,
        token_pool_count=token_pool_count,
        available_tokens=available_tokens,
        daily_stats=daily_stats,
        model_stats=model_stats,
    )
