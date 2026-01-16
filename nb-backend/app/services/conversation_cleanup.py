"""
对话清理服务 - 14天自动清理
使用东八区时间 (UTC+8)

⚠️ 重要：此服务仅清理用户的对话历史数据，不会影响其他任何表：
   - ✅ 清理: conversations（对话表）
   - ✅ 清理: conversation_messages（对话消息表，通过级联）
   - ❌ 不清理: users（用户表）
   - ❌ 不清理: credit_transactions（积分记录）
   - ❌ 不清理: redeem_codes（兑换码）
   - ❌ 不清理: token_pool（Token池）
   - ❌ 不清理: usage_logs（使用日志）
   - ❌ 不清理: tickets（工单）
   - ❌ 不清理: 其他所有表
"""
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
import logging

# 仅导入对话相关的模型，确保不会误操作其他表
from app.models.conversation import Conversation, ConversationMessage
from app.models.conversation_cleanup import ConversationCleanup
from app.models.user import User
from app.utils.timezone import CHINA_TZ, china_now, to_utc

logger = logging.getLogger(__name__)

# 保留天数
RETENTION_DAYS = 14


def get_china_now() -> datetime:
    """获取当前东八区时间"""
    return china_now()


def get_cutoff_time() -> datetime:
    """获取截止时间（东八区14天前）"""
    return get_china_now() - timedelta(days=RETENTION_DAYS)


async def cleanup_old_conversations(db: AsyncSession, dry_run: bool = False) -> dict:
    """
    清理超过14天的用户对话数据

    安全保证：
    1. 仅查询和删除 Conversation 表
    2. 通过 ORM cascade 级联删除 ConversationMessage
    3. User 表仅读取，不修改
    4. 其他所有表完全不受影响

    Args:
        db: 数据库会话
        dry_run: 是否为试运行（不实际删除）

    Returns:
        清理结果统计
    """
    cutoff_time = get_cutoff_time()
    cutoff_time_utc = to_utc(cutoff_time)

    logger.info(f"=" * 60)
    logger.info(f"开始清理用户对话数据（14天前的对话）")
    logger.info(f"截止时间（东八区）: {cutoff_time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"截止时间（UTC）: {cutoff_time_utc.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"试运行模式: {dry_run}")

    # 严格按照时间筛选：仅清理 updated_at < 14天前的对话
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.updated_at < cutoff_time_utc)
    )
    conversations_to_cleanup = result.scalars().all()

    if dry_run:
        logger.info(f"试运行：发现 {len(conversations_to_cleanup)} 个对话将被清理")
        return {
            "dry_run": True,
            "retention_days": RETENTION_DAYS,
            "cutoff_time": cutoff_time.strftime('%Y-%m-%d %H:%M:%S %Z'),
            "total_conversations": len(conversations_to_cleanup),
            "conversations": [
                {
                    "id": c.id,
                    "user_id": c.user_id,
                    "title": c.title,
                    "updated_at": c.updated_at.strftime('%Y-%m-%d %H:%M:%S'),
                }
                for c in conversations_to_cleanup[:10]  # 只返回前10个作为预览
            ]
        }

    if not conversations_to_cleanup:
        logger.info("没有需要清理的对话")
        return {
            "cutoff_time": cutoff_time.strftime('%Y-%m-%d %H:%M:%S %Z'),
            "total_conversations": 0,
            "total_messages": 0,
        }

    # 获取用户信息用于记录（只读，不修改用户）
    user_ids = list(set(c.user_id for c in conversations_to_cleanup))
    user_result = await db.execute(select(User).where(User.id.in_(user_ids)))
    users = {u.id: u for u in user_result.scalars().all()}

    # 记录清理详情（用于审计）
    cleanup_records = []
    stats = {
        "retention_days": RETENTION_DAYS,
        "cutoff_time": cutoff_time.strftime('%Y-%m-%d %H:%M:%S %Z'),
        "total_conversations": len(conversations_to_cleanup),
        "total_messages": 0,
        "by_user": {},
    }

    for conv in conversations_to_cleanup:
        user = users.get(conv.user_id)
        stats["total_messages"] += len(conv.messages)

        # 创建清理记录（审计用途）
        record = ConversationCleanup(
            user_id=conv.user_id,
            user_email=user.email if user else "未知用户",
            user_nickname=user.nickname if user else None,
            conversation_id=conv.id,
            conversation_title=conv.title,
            message_count=conv.message_count,
            conversation_created_at=conv.created_at,
            conversation_updated_at=conv.updated_at,
            cleanup_reason="auto_14days",
        )
        cleanup_records.append(record)

        # 按用户统计
        if user:
            email = user.email
            if email not in stats["by_user"]:
                stats["by_user"][email] = {
                    "user_id": user.id,
                    "nickname": user.nickname,
                    "conversation_count": 0,
                    "message_count": 0,
                }
            stats["by_user"][email]["conversation_count"] += 1
            stats["by_user"][email]["message_count"] += len(conv.messages)

    # 执行删除：仅删除 Conversation 表的数据
    # ConversationMessage 通过 ORM cascade="all, delete-orphan" 自动级联删除
    # 不会影响 users 表或任何其他表
    logger.info(f"开始删除 {len(conversations_to_cleanup)} 个对话...")
    for conv in conversations_to_cleanup:
        await db.delete(conv)

    # 批量添加清理记录（审计表）
    db.add_all(cleanup_records)

    await db.commit()

    logger.info(f"✓ 清理完成")
    logger.info(f"  - 删除对话: {stats['total_conversations']} 个")
    logger.info(f"  - 删除消息: {stats['total_messages']} 条")
    logger.info(f"  - 清理记录: {len(cleanup_records)} 条")
    logger.info(f"=" * 60)

    return stats


async def get_cleanup_history(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 50
) -> tuple[list[dict], int]:
    """
    获取清理历史记录（审计用）

    Returns:
        (记录列表, 总数)
    """
    from sqlalchemy import func, desc
    count_result = await db.execute(select(func.count(ConversationCleanup.id)))
    total = count_result.scalar() or 0

    result = await db.execute(
        select(ConversationCleanup)
        .order_by(desc(ConversationCleanup.cleaned_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    records = result.scalars().all()

    records_list = [
        {
            "id": r.id,
            "user_email": r.user_email,
            "user_nickname": r.user_nickname,
            "conversation_title": r.conversation_title,
            "message_count": r.message_count,
            "conversation_updated_at": r.conversation_updated_at.strftime('%Y-%m-%d %H:%M:%S'),
            "cleanup_reason": r.cleanup_reason,
            "cleaned_at": r.cleaned_at.strftime('%Y-%m-%d %H:%M:%S'),
        }
        for r in records
    ]

    return records_list, total
