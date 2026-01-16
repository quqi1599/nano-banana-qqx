"""
统计路由
"""
from datetime import datetime, timedelta, date as date_type
from io import StringIO
import csv
import hashlib
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
CACHE_KEY_PREFIX = "stats:dashboard:v3"


def _generate_cache_key(start_dt: date_type, end_dt: date_type,
                         include_daily: bool, include_model: bool,
                         include_growth: bool) -> str:
    """生成固定长度的缓存键（使用哈希避免键过长）"""
    key_data = f"{start_dt.isoformat()}:{end_dt.isoformat()}:{include_daily}:{include_model}:{include_growth}"
    hash_hex = hashlib.md5(key_data.encode()).hexdigest()[:16]
    return f"{CACHE_KEY_PREFIX}:{hash_hex}"


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

    cache_key = _generate_cache_key(
        start_dt, end_dt, include_daily_stats, include_model_stats, include_user_growth
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
    
    # 按日期范围的每日统计（使用单次 GROUP BY 查询，避免 N+1）
    daily_stats = []
    if include_daily_stats:
        daily_result = await db.execute(
            select(
                cast(UsageLog.created_at, Date).label('date'),
                func.count(UsageLog.id).label('total_requests'),
                func.sum(UsageLog.credits_used).label('total_credits'),
                func.count(func.distinct(UsageLog.user_id)).label('unique_users'),
            )
            .where(
                and_(
                    cast(UsageLog.created_at, Date) >= start_dt,
                    cast(UsageLog.created_at, Date) <= end_dt
                )
            )
            .group_by(cast(UsageLog.created_at, Date))
            .order_by(cast(UsageLog.created_at, Date))
        )
        daily_rows = {row.date: row for row in daily_result.all()}

        # 填充所有日期（包括没有数据的日期）
        current_date = start_dt
        while current_date <= end_dt:
            row = daily_rows.get(current_date)
            daily_stats.append(DailyStats(
                date=current_date.isoformat(),
                total_requests=row.total_requests if row else 0,
                total_credits_used=row.total_credits if row else 0,
                unique_users=row.unique_users if row else 0,
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
    
    # 用户增长趋势（使用单次查询获取累计用户数）
    user_growth = []
    if include_user_growth:
        # 获取所有用户的创建日期，计算累计用户数
        user_stats_result = await db.execute(
            select(
                cast(User.created_at, Date).label('date'),
                func.count(User.id).label('new_users'),
            )
            .where(cast(User.created_at, Date) <= end_dt)
            .group_by(cast(User.created_at, Date))
            .order_by(cast(User.created_at, Date))
        )
        user_rows = user_stats_result.all()

        # 计算累计用户数
        running_total = 0
        user_stats_by_date = {}
        for row in user_rows:
            running_total += row.new_users
            user_stats_by_date[row.date] = (row.new_users, running_total)

        # 填充所有日期
        current_date = start_dt
        while current_date <= end_dt:
            stats = user_stats_by_date.get(current_date, (0, running_total))
            # 如果当天没有新用户，使用之前的累计数
            if current_date not in user_stats_by_date:
                # 找到这一天之前的累计数
                running_total_before = 0
                for d in sorted(user_stats_by_date.keys()):
                    if d < current_date:
                        running_total_before = user_stats_by_date[d][1]
                    else:
                        break
                stats = (0, running_total_before)

            user_growth.append(UserGrowthStats(
                date=current_date.isoformat(),
                new_users=stats[0],
                total_users=stats[1],
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
    """导出统计数据为 CSV（优化格式）"""
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        start_dt = datetime.utcnow().date() - timedelta(days=6)
        end_dt = datetime.utcnow().date()

    if start_dt > end_dt:
        start_dt, end_dt = end_dt, start_dt

    output = StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)

    # 写入 UTF-8 BOM 以支持 Excel 中文
    output.write('\ufeff')

    # 写入标题行
    export_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    writer.writerow(['NanoBanana 统计数据导出'])
    writer.writerow([f'导出时间: {export_time}'])
    writer.writerow([f'统计周期: {start_date} 至 {end_date}'])
    writer.writerow([f'导出人: {admin.email}'])
    writer.writerow([])  # 空行

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    if data_type == "daily":
        writer.writerow([])
        writer.writerow(['【每日统计】'])
        writer.writerow([])
        writer.writerow(['日期', '请求次数', '消耗积分', '活跃用户数'])
        # 使用单次 GROUP BY 查询，避免 N+1
        daily_result = await db.execute(
            select(
                cast(UsageLog.created_at, Date).label('date'),
                func.count(UsageLog.id).label('total_requests'),
                func.sum(UsageLog.credits_used).label('total_credits'),
                func.count(func.distinct(UsageLog.user_id)).label('unique_users'),
            )
            .where(
                and_(
                    cast(UsageLog.created_at, Date) >= start_dt,
                    cast(UsageLog.created_at, Date) <= end_dt
                )
            )
            .group_by(cast(UsageLog.created_at, Date))
            .order_by(cast(UsageLog.created_at, Date))
        )
        daily_rows = {row.date: row for row in daily_result.all()}

        # 填充所有日期（包括没有数据的日期）
        current_date = start_dt
        while current_date <= end_dt:
            row = daily_rows.get(current_date)
            writer.writerow([
                current_date.isoformat(),
                row.total_requests if row else 0,
                int(row.total_credits) if row and row.total_credits else 0,
                row.unique_users if row else 0,
            ])
            current_date += timedelta(days=1)
        filename = f"NanoBanana_每日统计_{start_date}_至_{end_date}_{timestamp}.csv"

    elif data_type == "model":
        writer.writerow([])
        writer.writerow(['【模型使用统计】'])
        writer.writerow([])
        writer.writerow(['模型名称', '请求次数', '消耗积分'])
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
                row[0] or "未知模型",
                row[1] or 0,
                int(row[2]) if row[2] else 0,
            ])
        filename = f"NanoBanana_模型统计_{start_date}_至_{end_date}_{timestamp}.csv"

    elif data_type == "user_growth":
        writer.writerow([])
        writer.writerow(['【用户增长统计】'])
        writer.writerow([])
        writer.writerow(['日期', '新增用户数', '累计用户数'])
        # 使用单次查询获取所有日期的新增用户数，避免 N+1
        user_stats_result = await db.execute(
            select(
                cast(User.created_at, Date).label('date'),
                func.count(User.id).label('new_users'),
            )
            .where(cast(User.created_at, Date) <= end_dt)
            .group_by(cast(User.created_at, Date))
            .order_by(cast(User.created_at, Date))
        )
        user_rows = user_stats_result.all()

        # 计算累计用户数
        running_total = 0
        user_stats_by_date = {}
        for row in user_rows:
            running_total += row.new_users
            user_stats_by_date[row.date] = (row.new_users, running_total)

        # 填充所有日期
        current_date = start_dt
        while current_date <= end_dt:
            stats = user_stats_by_date.get(current_date)
            if stats:
                new_users, total_users = stats
            else:
                # 如果当天没有新用户，找到之前的累计数
                new_users = 0
                total_users = 0
                for d in sorted(user_stats_by_date.keys()):
                    if d < current_date:
                        total_users = user_stats_by_date[d][1]
                    else:
                        break

            writer.writerow([
                current_date.isoformat(),
                new_users,
                total_users,
            ])
            current_date += timedelta(days=1)
        filename = f"NanoBanana_用户增长_{start_date}_至_{end_date}_{timestamp}.csv"

    else:
        return {"error": "Invalid data_type"}

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

