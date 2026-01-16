"""
统计任务

支持：
- 每小时统计
- 每日统计报告
- 用户使用统计
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any
from collections import defaultdict

from app.celery_app import celery_app
from app.tasks.base import get_task_db, record_task_result

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.tasks.stats_tasks.collect_hourly_stats_task",
    bind=True,
)
def collect_hourly_stats_task(self) -> Dict[str, Any]:
    """
    每小时收集统计数据（定时任务）

    Returns:
        统计结果
    """
    task_id = self.request.id
    start_time = datetime.now()

    logger.info(f"[{task_id}] 开始收集每小时统计")

    db = get_task_db()

    try:
        from sqlalchemy import func, and_
        from app.models.user import User
        from app.models.credit import CreditTransaction
        from app.models.usage_log import UsageLog
        from app.models.conversation import Conversation

        # 过去一小时的时间范围
        now = datetime.utcnow()
        hour_ago = now - timedelta(hours=1)

        stats = {
            "period": {
                "start": hour_ago.isoformat(),
                "end": now.isoformat(),
            },
            "users": {},
            "credits": {},
            "conversations": {},
        }

        # 新用户数
        new_users = db.execute(
            func.count(User.id).where(User.created_at >= hour_ago)
        ).scalar()
        stats["users"]["new"] = new_users or 0

        # 总用户数
        total_users = db.execute(func.count(User.id)).scalar()
        stats["users"]["total"] = total_users or 0

        # 活跃用户数（有 API 调用）
        active_users = db.execute(
            func.count(func.distinct(UsageLog.user_id)).where(
                UsageLog.created_at >= hour_ago
            )
        ).scalar()
        stats["users"]["active"] = active_users or 0

        # 积分消耗
        credit_used = db.execute(
            func.sum(func.abs(CreditTransaction.amount)).where(
                and_(
                    CreditTransaction.amount < 0,
                    CreditTransaction.created_at >= hour_ago,
                )
            )
        ).scalar()
        stats["credits"]["used"] = int(credit_used or 0)

        # 积分充值
        credit_added = db.execute(
            func.sum(CreditTransaction.amount).where(
                and_(
                    CreditTransaction.amount > 0,
                    CreditTransaction.created_at >= hour_ago,
                )
            )
        ).scalar()
        stats["credits"]["added"] = int(credit_added or 0)

        # 新对话数
        new_conversations = db.execute(
            func.count(Conversation.id).where(
                Conversation.created_at >= hour_ago
            )
        ).scalar()
        stats["conversations"]["new"] = new_conversations or 0

        # API 调用次数
        api_calls = db.execute(
            func.count(UsageLog.id).where(UsageLog.created_at >= hour_ago)
        ).scalar()
        stats["api_calls"] = api_calls or 0

        # 可以在这里写入统计表
        # db.add(StatsMetric(**stats))

        duration = (datetime.now() - start_time).total_seconds()

        return record_task_result(
            task_id=task_id,
            task_name="collect_hourly_stats",
            status="success",
            result=stats,
            duration=duration,
        )

    except Exception as e:
        logger.error(f"[{task_id}] 统计收集失败: {e}")
        db.rollback()
        duration = (datetime.now() - start_time).total_seconds()

        record_task_result(
            task_id=task_id,
            task_name="collect_hourly_stats",
            status="failed",
            error=str(e),
            duration=duration,
        )
        raise

    finally:
        db.close()


@celery_app.task(
    name="app.tasks.stats_tasks.generate_daily_report_task",
    bind=True,
)
def generate_daily_report_task(self) -> Dict[str, Any]:
    """
    生成每日统计报告

    Returns:
        报告数据
    """
    task_id = self.request.id
    start_time = datetime.now()

    logger.info(f"[{task_id}] 开始生成每日报告")

    db = get_task_db()

    try:
        from sqlalchemy import func, and_
        from app.models.user import User
        from app.models.credit import CreditTransaction
        from app.models.usage_log import UsageLog

        # 昨天的时间范围
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)

        report = {
            "date": yesterday.strftime("%Y-%m-%d"),
            "users": {
                "new": 0,
                "total": 0,
                "active": 0,
            },
            "credits": {
                "used": 0,
                "added": 0,
            },
            "api_calls": 0,
        }

        # 新用户
        report["users"]["new"] = db.execute(
            func.count(User.id).where(
                and_(
                    User.created_at >= yesterday,
                    User.created_at < today,
                )
            )
        ).scalar() or 0

        # 总用户
        report["users"]["total"] = db.execute(
            func.count(User.id).where(User.created_at < today)
        ).scalar() or 0

        # 活跃用户
        report["users"]["active"] = db.execute(
            func.count(func.distinct(UsageLog.user_id)).where(
                and_(
                    UsageLog.created_at >= yesterday,
                    UsageLog.created_at < today,
                )
            )
        ).scalar() or 0

        # 积分消耗
        report["credits"]["used"] = db.execute(
            func.sum(func.abs(CreditTransaction.amount)).where(
                and_(
                    CreditTransaction.amount < 0,
                    CreditTransaction.created_at >= yesterday,
                    CreditTransaction.created_at < today,
                )
            )
        ).scalar() or 0

        # 积分充值
        report["credits"]["added"] = db.execute(
            func.sum(CreditTransaction.amount).where(
                and_(
                    CreditTransaction.amount > 0,
                    CreditTransaction.created_at >= yesterday,
                    CreditTransaction.created_at < today,
                )
            )
        ).scalar() or 0

        # API 调用
        report["api_calls"] = db.execute(
            func.count(UsageLog.id).where(
                and_(
                    UsageLog.created_at >= yesterday,
                    UsageLog.created_at < today,
                )
            )
        ).scalar() or 0

        duration = (datetime.now() - start_time).total_seconds()

        return record_task_result(
            task_id=task_id,
            task_name="generate_daily_report",
            status="success",
            result=report,
            duration=duration,
        )

    except Exception as e:
        logger.error(f"[{task_id}] 报告生成失败: {e}")
        db.rollback()
        duration = (datetime.now() - start_time).total_seconds()

        record_task_result(
            task_id=task_id,
            task_name="generate_daily_report",
            status="failed",
            error=str(e),
            duration=duration,
        )
        raise

    finally:
        db.close()


@celery_app.task(
    name="app.tasks.stats_tasks.calculate_user_rankings_task",
    bind=True,
)
def calculate_user_rankings_task(
    self,
    ranking_type: str = "credits_used",
    limit: int = 100,
) -> Dict[str, Any]:
    """
    计算用户排行榜

    Args:
        ranking_type: 排行榜类型 (credits_used, api_calls, conversations)
        limit: 返回数量

    Returns:
        排行榜数据
    """
    task_id = self.request.id
    start_time = datetime.now()

    logger.info(f"[{task_id}] 开始计算用户排行榜: {ranking_type}")

    db = get_task_db()

    try:
        from sqlalchemy import desc, func
        from app.models.user import User
        from app.models.usage_log import UsageLog
        from app.models.credit import CreditTransaction

        rankings = []

        if ranking_type == "credits_used":
            # 按积分消耗排行
            query = (
                db.query(
                    User.id,
                    User.email,
                    User.nickname,
                    func.sum(func.abs(CreditTransaction.amount)).label("total_used"),
                )
                .join(CreditTransaction, User.id == CreditTransaction.user_id)
                .filter(CreditTransaction.amount < 0)
                .group_by(User.id)
                .order_by(desc("total_used"))
                .limit(limit)
            )
            for row in query:
                rankings.append({
                    "user_id": row.id,
                    "email": row.email,
                    "nickname": row.nickname,
                    "value": int(row.total_used),
                })

        elif ranking_type == "api_calls":
            # 按 API 调用次数排行
            query = (
                db.query(
                    User.id,
                    User.email,
                    User.nickname,
                    func.count(UsageLog.id).label("total_calls"),
                )
                .join(UsageLog, User.id == UsageLog.user_id)
                .group_by(User.id)
                .order_by(desc("total_calls"))
                .limit(limit)
            )
            for row in query:
                rankings.append({
                    "user_id": row.id,
                    "email": row.email,
                    "nickname": row.nickname,
                    "value": row.total_calls,
                })

        duration = (datetime.now() - start_time).total_seconds()

        return record_task_result(
            task_id=task_id,
            task_name="calculate_user_rankings",
            status="success",
            result={
                "type": ranking_type,
                "limit": limit,
                "rankings": rankings,
            },
            duration=duration,
        )

    except Exception as e:
        logger.error(f"[{task_id}] 排行榜计算失败: {e}")
        duration = (datetime.now() - start_time).total_seconds()

        record_task_result(
            task_id=task_id,
            task_name="calculate_user_rankings",
            status="failed",
            error=str(e),
            duration=duration,
        )
        raise

    finally:
        db.close()
