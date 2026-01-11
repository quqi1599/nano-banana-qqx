"""
统计路由
"""
from datetime import datetime, timedelta, date as date_type
from io import StringIO
import csv
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date, and_

from app.database import get_db
from app.models.user import User
from app.models.token_pool import TokenPool
from app.models.usage_log import UsageLog
from app.schemas.admin import DashboardStats, DailyStats, ModelStats, UserGrowthStats
from app.utils.security import get_admin_user
from app.utils.cache import get_cached_json, set_cached_json

router = APIRouter()

CACHE_TTL_SECONDS = 60
CACHE_KEY_PREFIX = "stats:dashboard:v2"


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    start_date: str = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: str = Query(None, description="结束日期 (YYYY-MM-DD)"),
    include_daily_stats: bool = Query(True),
    include_model_stats: bool = Query(True),
    include_user_growth: bool = Query(True),
):
    """获取仪表盘统计数据，支持自定义日期范围"""
    today = datetime.utcnow().date()
    
    # 解析日期参数，默认近7天
    if end_date:
        try:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            end_dt = today
    else:
        end_dt = today
    
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            start_dt = end_dt - timedelta(days=6)
    else:
        start_dt = end_dt - timedelta(days=6)
    
    # 确保日期范围合理
    if start_dt > end_dt:
        start_dt, end_dt = end_dt, start_dt
    
    # 限制最大范围为90天
    if (end_dt - start_dt).days > 90:
        start_dt = end_dt - timedelta(days=90)
    
    cache_key = (
        f"{CACHE_KEY_PREFIX}:{start_dt.isoformat()}:{end_dt.isoformat()}:"
        f"{int(include_daily_stats)}:{int(include_model_stats)}:{int(include_user_growth)}"
    )
    cached = await get_cached_json(cache_key)
    if cached is not None:
        return cached
    
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
    
    # 今日消耗积分
    today_credits_result = await db.execute(
        select(func.sum(UsageLog.credits_used)).where(
            cast(UsageLog.created_at, Date) == today
        )
    )
    today_credits_used = today_credits_result.scalar() or 0
    
    # 今日图片调用次数
    today_image_result = await db.execute(
        select(func.count(UsageLog.id)).where(
            cast(UsageLog.created_at, Date) == today,
            UsageLog.request_type == 'generate_image'
        )
    )
    today_image_calls = today_image_result.scalar() or 0
    
    # Token 池信息
    token_count_result = await db.execute(select(func.count(TokenPool.id)))
    token_pool_count = token_count_result.scalar() or 0
    
    available_tokens_result = await db.execute(
        select(func.count(TokenPool.id)).where(
            TokenPool.is_active == True,
        )
    )
    available_tokens = available_tokens_result.scalar() or 0
    
    # 按日期范围的每日统计
    daily_stats = []
    if include_daily_stats:
        current_date = start_dt
        while current_date <= end_dt:
            daily_result = await db.execute(
                select(
                    func.count(UsageLog.id),
                    func.sum(UsageLog.credits_used),
                    func.count(func.distinct(UsageLog.user_id)),
                ).where(cast(UsageLog.created_at, Date) == current_date)
            )
            row = daily_result.one()
            
            daily_stats.append(DailyStats(
                date=current_date.isoformat(),
                total_requests=row[0] or 0,
                total_credits_used=row[1] or 0,
                unique_users=row[2] or 0,
            ))
            current_date += timedelta(days=1)
    
    # 按日期范围的模型使用统计
    model_stats = []
    if include_model_stats:
        model_result = await db.execute(
            select(
                UsageLog.model_name,
                func.count(UsageLog.id),
                func.sum(UsageLog.credits_used),
            )
            .where(
                and_(
                    cast(UsageLog.created_at, Date) >= start_dt,
                    cast(UsageLog.created_at, Date) <= end_dt
                )
            )
            .group_by(UsageLog.model_name)
            .order_by(func.count(UsageLog.id).desc())
        )
        model_rows = model_result.all()
        
        model_stats = [
            ModelStats(
                model_name=row[0] or "unknown",
                total_requests=row[1] or 0,
                total_credits_used=row[2] or 0,
            )
            for row in model_rows
        ]
    
    # 用户增长趋势
    user_growth = []
    if include_user_growth:
        # 获取日期范围内每日新增用户
        current_date = start_dt
        while current_date <= end_dt:
            # 当日新增用户
            new_users_result = await db.execute(
                select(func.count(User.id)).where(
                    cast(User.created_at, Date) == current_date
                )
            )
            new_users = new_users_result.scalar() or 0
            
            # 截至当日总用户
            total_users_by_date_result = await db.execute(
                select(func.count(User.id)).where(
                    cast(User.created_at, Date) <= current_date
                )
            )
            total_users_by_date = total_users_by_date_result.scalar() or 0
            
            user_growth.append(UserGrowthStats(
                date=current_date.isoformat(),
                new_users=new_users,
                total_users=total_users_by_date,
            ))
            current_date += timedelta(days=1)
    
    payload = DashboardStats(
        total_users=total_users,
        active_users_today=active_users_today,
        total_credits_consumed=total_credits_consumed,
        total_requests_today=total_requests_today,
        token_pool_count=token_pool_count,
        available_tokens=available_tokens,
        today_credits_used=today_credits_used,
        today_image_calls=today_image_calls,
        daily_stats=daily_stats,
        model_stats=model_stats,
        user_growth=user_growth,
    )
    await set_cached_json(cache_key, payload.model_dump(mode="json"), CACHE_TTL_SECONDS)
    return payload


@router.get("/export")
async def export_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
    start_date: str = Query(..., description="开始日期 (YYYY-MM-DD)"),
    end_date: str = Query(..., description="结束日期 (YYYY-MM-DD)"),
    data_type: str = Query("daily", description="导出类型: daily, model, user_growth"),
):
    """导出统计数据为 CSV"""
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        start_dt = datetime.utcnow().date() - timedelta(days=6)
        end_dt = datetime.utcnow().date()
    
    if start_dt > end_dt:
        start_dt, end_dt = end_dt, start_dt
    
    output = StringIO()
    writer = csv.writer(output)
    
    if data_type == "daily":
        writer.writerow(["日期", "请求数", "消耗积分", "活跃用户"])
        current_date = start_dt
        while current_date <= end_dt:
            result = await db.execute(
                select(
                    func.count(UsageLog.id),
                    func.sum(UsageLog.credits_used),
                    func.count(func.distinct(UsageLog.user_id)),
                ).where(cast(UsageLog.created_at, Date) == current_date)
            )
            row = result.one()
            writer.writerow([
                current_date.isoformat(),
                row[0] or 0,
                row[1] or 0,
                row[2] or 0,
            ])
            current_date += timedelta(days=1)
        filename = f"daily_stats_{start_date}_to_{end_date}.csv"
    
    elif data_type == "model":
        writer.writerow(["模型名称", "请求数", "消耗积分"])
        result = await db.execute(
            select(
                UsageLog.model_name,
                func.count(UsageLog.id),
                func.sum(UsageLog.credits_used),
            )
            .where(
                and_(
                    cast(UsageLog.created_at, Date) >= start_dt,
                    cast(UsageLog.created_at, Date) <= end_dt
                )
            )
            .group_by(UsageLog.model_name)
            .order_by(func.count(UsageLog.id).desc())
        )
        for row in result.all():
            writer.writerow([
                row[0] or "unknown",
                row[1] or 0,
                row[2] or 0,
            ])
        filename = f"model_stats_{start_date}_to_{end_date}.csv"
    
    elif data_type == "user_growth":
        writer.writerow(["日期", "新增用户", "累计用户"])
        current_date = start_dt
        while current_date <= end_dt:
            new_users_result = await db.execute(
                select(func.count(User.id)).where(
                    cast(User.created_at, Date) == current_date
                )
            )
            new_users = new_users_result.scalar() or 0
            
            total_users_result = await db.execute(
                select(func.count(User.id)).where(
                    cast(User.created_at, Date) <= current_date
                )
            )
            total_users = total_users_result.scalar() or 0
            
            writer.writerow([
                current_date.isoformat(),
                new_users,
                total_users,
            ])
            current_date += timedelta(days=1)
        filename = f"user_growth_{start_date}_to_{end_date}.csv"
    
    else:
        return {"error": "Invalid data_type"}
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

