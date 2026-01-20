"""
用户管理路由
"""
import csv
import io
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete

from app.database import get_db
from app.models.user import User
from app.models.usage_log import UsageLog
from app.models.credit import CreditTransaction, TransactionType
from app.schemas.admin import (
    UserListResponse,
    AdminUserResponse,
    UserStatsResponse,
    UserNoteUpdate,
    UserStatusUpdate,
    UserTagsUpdate,
    UserTagsResponse,
    UserCreate,
    UserPasswordUpdate,
    BatchStatusUpdate,
    BatchCreditsUpdate,
    CreditHistoryResponse,
    UsageLogResponse,
    LoginFailureResponse,
    LoginFailureItem,
)
from app.utils.security import get_admin_user, get_password_hash
from app.utils.rate_limiter import RateLimiter
from app.utils.redis_client import redis_client
from app.config import get_settings

from .init import _record_admin_audit, _verify_admin_confirm_token

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()

LOGIN_FAIL_IP_KEY_PREFIX = "login_fail_ip:"
LOGIN_FAIL_IP_TS_PREFIX = "login_fail_ip_ts:"
LOGIN_FAIL_IP_EMAIL_PREFIX = "login_fail_ip_email:"


def _normalize_reason(reason: str) -> str:
    """
    标准化操作原因文本

    Args:
        reason: 原因文本

    Returns:
        清理后的原因文本

    Raises:
        HTTPException: 原因太短时
    """
    cleaned = reason.strip()
    if len(cleaned) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="操作原因至少 4 个字符",
        )
    return cleaned


def _apply_user_list_filters(
    query,
    search: Optional[str],
    tags: list,
    is_admin: Optional[bool],
    is_active: Optional[bool],
    min_balance: Optional[int],
    max_balance: Optional[int],
    created_after: Optional[str],
    created_before: Optional[str],
    login_after: Optional[str],
    login_before: Optional[str],
):
    """
    应用用户列表的筛选条件（复用逻辑避免重复）

    Args:
        query: SQLAlchemy查询对象
        search: 搜索关键词（邮箱或昵称）
        tags: 用户标签列表
        is_admin: 是否管理员筛选
        is_active: 是否激活筛选
        min_balance: 最小余额
        max_balance: 最大余额
        created_after: 注册时间起始
        created_before: 注册时间结束
        login_after: 登录时间起始
        login_before: 登录时间结束

    Returns:
        应用筛选条件后的查询对象
    """
    # 搜索筛选
    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) |
            (User.nickname.ilike(f"%{search}%"))
        )

    # 标签筛选（全部匹配）
    cleaned_tags = [tag.strip() for tag in tags or [] if tag and tag.strip()]
    for tag in cleaned_tags:
        query = query.where(User.tags.contains([tag]))

    # 角色筛选
    if is_admin is not None:
        query = query.where(User.is_admin == is_admin)

    # 状态筛选
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    # 余额区间筛选
    if min_balance is not None:
        query = query.where(User.credit_balance >= min_balance)
    if max_balance is not None:
        query = query.where(User.credit_balance <= max_balance)

    # 注册时间筛选
    if created_after:
        try:
            after_date = datetime.strptime(created_after, "%Y-%m-%d")
            query = query.where(User.created_at >= after_date)
        except ValueError:
            pass
    if created_before:
        try:
            before_date = datetime.strptime(created_before, "%Y-%m-%d")
            # 包含当天，所以加一天
            before_date = before_date.replace(hour=23, minute=59, second=59)
            query = query.where(User.created_at <= before_date)
        except ValueError:
            pass

    # 登录时间筛选
    if login_after:
        try:
            after_date = datetime.strptime(login_after, "%Y-%m-%d")
            query = query.where(User.last_login_at >= after_date)
        except ValueError:
            pass
    if login_before:
        try:
            before_date = datetime.strptime(login_before, "%Y-%m-%d")
            before_date = before_date.replace(hour=23, minute=59, second=59)
            query = query.where(User.last_login_at <= before_date)
        except ValueError:
            pass

    return query


@router.get("/users", response_model=UserListResponse)
async def list_users(
    search: Optional[str] = Query(None, description="搜索邮箱或昵称"),
    is_admin: Optional[bool] = Query(None, description="筛选管理员"),
    is_active: Optional[bool] = Query(None, description="筛选激活状态"),
    min_balance: Optional[int] = Query(None, description="最小余额"),
    max_balance: Optional[int] = Query(None, description="最大余额"),
    created_after: Optional[str] = Query(None, description="注册时间起始 (YYYY-MM-DD)"),
    created_before: Optional[str] = Query(None, description="注册时间结束 (YYYY-MM-DD)"),
    login_after: Optional[str] = Query(None, description="登录时间起始 (YYYY-MM-DD)"),
    login_before: Optional[str] = Query(None, description="登录时间结束 (YYYY-MM-DD)"),
    tags: Optional[list[str]] = Query(None, description="用户标签"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取用户列表（支持高级筛选）

    Returns:
        用户列表响应，包含用户信息和分页数据
    """
    # 构建基础查询并应用筛选条件
    query = _apply_user_list_filters(
        select(User),
        search=search,
        tags=tags or [],
        is_admin=is_admin,
        is_active=is_active,
        min_balance=min_balance,
        max_balance=max_balance,
        created_after=created_after,
        created_before=created_before,
        login_after=login_after,
        login_before=login_before,
    )

    # 构建计数查询并应用相同的筛选条件
    count_query = _apply_user_list_filters(
        select(func.count(User.id)),
        search=search,
        tags=tags or [],
        is_admin=is_admin,
        is_active=is_active,
        min_balance=min_balance,
        max_balance=max_balance,
        created_after=created_after,
        created_before=created_before,
        login_after=login_after,
        login_before=login_before,
    )

    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # 分页和排序
    query = query.order_by(User.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    users = result.scalars().all()

    user_ids = [user.id for user in users]
    usage_map: dict[str, int] = {}
    if user_ids:
        usage_result = await db.execute(
            select(UsageLog.user_id, func.count(UsageLog.id))
            .where(UsageLog.user_id.in_(user_ids))
            .group_by(UsageLog.user_id)
        )
        usage_map = {row[0]: row[1] for row in usage_result.all()}

    # 构建响应
    user_responses = []
    for user in users:
        total_usage = usage_map.get(user.id, 0)
        user_dict = AdminUserResponse.model_validate(user).model_dump()
        user_dict["total_usage"] = total_usage
        user_responses.append(AdminUserResponse(**user_dict))

    return UserListResponse(
        users=user_responses,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/users/stats", response_model=UserStatsResponse)
async def get_users_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取用户统计概览

    Returns:
        用户统计数据
    """
    # 总用户数
    total_result = await db.execute(select(func.count(User.id)))
    total_users = total_result.scalar() or 0

    # 今日新增用户
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_result = await db.execute(
        select(func.count(User.id)).where(User.created_at >= today)
    )
    new_today = today_result.scalar() or 0

    # 禁用用户数
    disabled_result = await db.execute(
        select(func.count(User.id)).where(User.is_active == False)
    )
    disabled_count = disabled_result.scalar() or 0

    # 有余额用户数（付费用户）
    paid_result = await db.execute(
        select(func.count(User.id)).where(User.credit_balance > 0)
    )
    paid_users = paid_result.scalar() or 0

    return UserStatsResponse(
        total_users=total_users,
        new_today=new_today,
        disabled_count=disabled_count,
        paid_users=paid_users,
    )


@router.get("/users/tags", response_model=UserTagsResponse)
async def get_all_user_tags(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取所有用户标签及其统计

    Returns:
        标签统计响应，包含标签列表和使用次数
    """
    result = await db.execute(select(User))
    users = result.scalars().all()

    tag_counts: dict[str, int] = {}
    for user in users:
        if user.tags:
            for tag in user.tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    # 按使用次数排序
    sorted_tags = sorted(tag_counts.keys(), key=lambda x: -tag_counts[x])

    return UserTagsResponse(
        tags=sorted_tags,
        counts=tag_counts,
    )


@router.get("/users/{user_id}/credit-history", response_model=CreditHistoryResponse)
async def get_user_credit_history(
    user_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    limit: Optional[int] = Query(None, ge=1, le=200),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取用户积分调整历史

    Args:
        user_id: 用户ID
        page: 页码
        page_size: 每页数量
        limit: 可选，限制返回数量（用于不分页）

    Returns:
        积分历史记录
    """
    # 验证用户存在
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    # 获取总数
    count_result = await db.execute(
        select(func.count(CreditTransaction.id)).where(CreditTransaction.user_id == user_id)
    )
    total = count_result.scalar() or 0

    resolved_page = page
    resolved_page_size = page_size
    if limit is not None:
        resolved_page = 1
        resolved_page_size = limit

    # 获取历史记录
    result = await db.execute(
        select(CreditTransaction)
        .where(CreditTransaction.user_id == user_id)
        .order_by(CreditTransaction.created_at.desc())
        .offset((resolved_page - 1) * resolved_page_size)
        .limit(resolved_page_size)
    )
    items = result.scalars().all()

    return CreditHistoryResponse(items=items, total=total)


@router.get("/users/{user_id}/usage-logs", response_model=UsageLogResponse)
async def get_user_usage_logs(
    user_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取用户积分消耗明细

    Args:
        user_id: 用户ID
        page: 页码
        page_size: 每页数量

    Returns:
        使用日志记录
    """
    # 验证用户存在
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    count_result = await db.execute(
        select(func.count(UsageLog.id)).where(UsageLog.user_id == user_id)
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        select(UsageLog)
        .where(UsageLog.user_id == user_id)
        .order_by(UsageLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = result.scalars().all()

    return UsageLogResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/users", response_model=AdminUserResponse)
async def create_user(
    data: UserCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    管理员创建新用户

    Args:
        data: 用户创建数据

    Returns:
        创建的用户信息

    Raises:
        HTTPException: 邮箱已存在时
    """
    # 检查邮箱是否已存在
    existing_result = await db.execute(select(User).where(User.email == data.email))
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册",
        )

    # 创建新用户
    new_user = User(
        email=data.email,
        password_hash=get_password_hash(data.password),
        nickname=data.nickname,
        credit_balance=data.credit_balance,
        pro3_balance=data.pro3_balance,
        flash_balance=data.flash_balance,
        is_admin=data.is_admin,
        is_active=True,
        note=data.note,
        tags=data.tags or [],
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    logger.info(f"Admin {admin.email} created new user {new_user.email}")

    return AdminUserResponse.model_validate(new_user)


@router.put("/users/{user_id}/credits")
async def adjust_user_credits(
    user_id: str,
    amount: int = Query(..., description="调整金额（正数增加，负数减少）"),
    reason: str = Query("管理员调整", description="调整原因"),
    type: str = Query("credit", description="积分类型: credit, pro3, flash"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    调整用户积分（支持 credit/pro3/flash）

    Args:
        user_id: 用户ID
        amount: 调整金额
        reason: 调整原因
        type: 积分类型

    Returns:
        调整后的余额

    Raises:
        HTTPException: 用户不存在或操作不合法时
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不能调整自己的灵感值",
        )

    # 根据类型调整不同的灵感值
    balance_field = type
    if type not in ("credit", "pro3", "flash"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的灵感值类型，支持: credit, pro3, flash",
        )

    old_balance = getattr(user, f"{type}_balance")
    new_balance = old_balance + amount
    if new_balance < 0:
        new_balance = 0
    actual_delta = new_balance - old_balance
    setattr(user, f"{type}_balance", new_balance)

    # 仅 credit 类型记录交易历史
    if type == "credit":
        transaction = CreditTransaction(
            user_id=user.id,
            amount=actual_delta,
            type=TransactionType.BONUS.value if amount > 0 else TransactionType.CONSUME.value,
            description=f"{reason} ({type})",
            balance_after=new_balance,
        )
        db.add(transaction)

    await db.commit()

    logger.info("Admin %s adjusted %s balance for user %s: %s -> %s",
                admin.email, type, user.email, old_balance, new_balance)

    return {"message": "调整成功", "new_balance": getattr(user, f"{type}_balance")}


@router.put("/users/{user_id}/note")
async def update_user_note(
    user_id: str,
    data: UserNoteUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    更新用户备注

    Args:
        user_id: 用户ID
        data: 备注数据

    Returns:
        更新成功消息
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    user.note = data.note
    await db.commit()

    return {"message": "备注更新成功"}


@router.put("/users/{user_id}/password")
async def change_user_password(
    user_id: str,
    data: UserPasswordUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    管理员修改用户密码

    Args:
        user_id: 用户ID
        data: 新密码数据

    Returns:
        修改成功消息
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    user.password_hash = get_password_hash(data.new_password)
    await db.commit()

    logger.info(f"Admin {admin.email} changed password for user {user.email}")

    return {"message": "密码修改成功"}


@router.put("/users/{user_id}/tags")
async def update_user_tags(
    user_id: str,
    data: UserTagsUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    更新用户标签

    Args:
        user_id: 用户ID
        data: 标签数据

    Returns:
        更新后的标签列表
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    user.tags = data.tags
    await db.commit()

    return {"message": "标签更新成功", "tags": user.tags}


@router.put("/users/{user_id}/active")
async def set_user_active_status(
    request: Request,
    user_id: str,
    data: UserStatusUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    设置用户激活状态

    Args:
        user_id: 用户ID
        data: 状态更新数据，包含 is_active 和 reason

    Returns:
        更新后的用户状态

    Raises:
        HTTPException: 用户不存在或操作不合法时
    """
    reason = _normalize_reason(data.reason)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    # 防止管理员禁用自己
    if user.id == admin.id and not data.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能禁用自己的账号",
        )

    # 防止禁用其他管理员（除非有更高权限）
    if user.is_admin and user.id != admin.id:
        logger.warning(f"Admin {admin.email} attempted to disable admin {user.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="不能禁用其他管理员账号",
        )

    user.is_active = data.is_active

    _record_admin_audit(
        db=db,
        admin=admin,
        action="set_user_status",
        target_type="user",
        target_ids=[user.id],
        reason=reason,
        status_text="success",
        request=request,
        details={"is_active": data.is_active},
    )
    await db.commit()

    logger.info(
        f"Admin {admin.email} set user {user.email} is_active={data.is_active}, reason: {reason}"
    )

    return {
        "message": "状态已更新",
        "user_id": user.id,
        "is_active": user.is_active,
    }


@router.post("/users/batch/status")
async def batch_set_user_status(
    request: Request,
    data: BatchStatusUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    批量设置用户状态

    Args:
        data: 批量状态更新数据

    Returns:
        更新的用户数量

    Raises:
        HTTPException: 参数不合法时
    """
    reason = _normalize_reason(data.reason)
    await _verify_admin_confirm_token(admin, "batch_status", data.confirm_token, request)

    if not data.user_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户ID列表不能为空",
        )

    # 获取目标用户
    result = await db.execute(
        select(User).where(User.id.in_(data.user_ids))
    )
    users = result.scalars().all()

    if not users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到任何有效用户",
        )

    updated_count = 0
    updated_ids: list[str] = []
    skipped_ids: list[str] = []
    for user in users:
        # 防止管理员禁用自己
        if user.id == admin.id and not data.is_active:
            skipped_ids.append(user.id)
            continue

        # 防止禁用其他管理员
        if user.is_admin and user.id != admin.id:
            logger.warning(f"Admin {admin.email} attempted to disable admin {user.email}")
            skipped_ids.append(user.id)
            continue

        user.is_active = data.is_active
        updated_count += 1
        updated_ids.append(user.id)

    _record_admin_audit(
        db=db,
        admin=admin,
        action="batch_set_user_status",
        target_type="user",
        target_ids=updated_ids,
        reason=reason,
        status_text="partial" if skipped_ids else "success",
        request=request,
        details={
            "requested_count": len(data.user_ids),
            "updated_count": updated_count,
            "skipped_count": len(skipped_ids),
            "skipped_ids": skipped_ids,
            "is_active": data.is_active,
        },
    )

    logger.info(
        f"Admin {admin.email} batch updated {updated_count} users to is_active={data.is_active}, reason: {reason}"
    )

    return {
        "message": f"已更新 {updated_count} 个用户的状态",
        "updated_count": updated_count,
    }


@router.post("/users/batch/credits")
async def batch_adjust_credits(
    request: Request,
    data: BatchCreditsUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    批量调整用户积分

    Args:
        data: 批量积分调整数据

    Returns:
        更新的用户数量

    Raises:
        HTTPException: 参数不合法时
    """
    reason = _normalize_reason(data.reason)
    await _verify_admin_confirm_token(admin, "batch_credits", data.confirm_token, request)

    if not data.user_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户ID列表不能为空",
        )

    if data.amount == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="调整金额不能为0",
        )

    # 获取目标用户
    result = await db.execute(
        select(User).where(User.id.in_(data.user_ids))
    )
    users = result.scalars().all()

    if not users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到任何有效用户",
        )

    updated_count = 0
    updated_ids: list[str] = []
    skipped_ids: list[str] = []
    total_delta = 0
    for user in users:
        if user.id == admin.id:
            skipped_ids.append(user.id)
            continue

        old_balance = user.credit_balance
        new_balance = old_balance + data.amount

        # 防止余额为负
        if new_balance < 0:
            new_balance = 0
        actual_delta = new_balance - old_balance
        user.credit_balance = new_balance

        # 记录交易
        transaction = CreditTransaction(
            user_id=user.id,
            amount=actual_delta,
            type=TransactionType.BONUS.value if data.amount > 0 else TransactionType.CONSUME.value,
            description=reason,
            balance_after=user.credit_balance,
        )
        db.add(transaction)
        updated_count += 1
        updated_ids.append(user.id)
        total_delta += actual_delta

    _record_admin_audit(
        db=db,
        admin=admin,
        action="batch_adjust_credits",
        target_type="user",
        target_ids=updated_ids,
        reason=reason,
        status_text="partial" if skipped_ids else "success",
        request=request,
        details={
            "requested_count": len(data.user_ids),
            "updated_count": updated_count,
            "skipped_count": len(skipped_ids),
            "skipped_ids": skipped_ids,
            "amount": data.amount,
            "total_delta": total_delta,
        },
    )

    logger.info(
        f"Admin {admin.email} batch adjusted credits for {updated_count} users, amount={data.amount}, reason: {reason}"
    )

    return {
        "message": f"已调整 {updated_count} 个用户的积分",
        "updated_count": updated_count,
    }


@router.get("/users/export")
async def export_users(
    search: Optional[str] = Query(None, description="搜索关键词"),
    is_admin: Optional[bool] = Query(None, description="筛选管理员"),
    is_active: Optional[bool] = Query(None, description="筛选激活状态"),
    min_balance: Optional[int] = Query(None, description="最小余额"),
    max_balance: Optional[int] = Query(None, description="最大余额"),
    created_after: Optional[str] = Query(None, description="注册时间起始 (YYYY-MM-DD)"),
    created_before: Optional[str] = Query(None, description="注册时间结束 (YYYY-MM-DD)"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    导出用户数据为 CSV（限制最多导出 10000 条记录）

    Returns:
        CSV 文件流
    """
    # 构建查询（复用筛选逻辑）
    query = select(User)

    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) |
            (User.nickname.ilike(f"%{search}%"))
        )
    if is_admin is not None:
        query = query.where(User.is_admin == is_admin)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if min_balance is not None:
        query = query.where(User.credit_balance >= min_balance)
    if max_balance is not None:
        query = query.where(User.credit_balance <= max_balance)
    if created_after:
        try:
            after_date = datetime.strptime(created_after, "%Y-%m-%d")
            query = query.where(User.created_at >= after_date)
        except ValueError:
            pass
    if created_before:
        try:
            before_date = datetime.strptime(created_before, "%Y-%m-%d")
            before_date = before_date.replace(hour=23, minute=59, second=59)
            query = query.where(User.created_at <= before_date)
        except ValueError:
            pass

    query = query.order_by(User.created_at.desc())

    # 限制导出数量，防止内存溢出
    query = query.limit(10000)

    result = await db.execute(query)
    users = result.scalars().all()

    # 创建 CSV（优化格式）
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)

    # 写入 UTF-8 BOM 以支持 Excel 中文
    output.write('\ufeff')

    # 写入标题行
    export_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    writer.writerow(['NanoBanana 用户数据导出'])
    writer.writerow([f'导出时间: {export_time}'])
    writer.writerow([f'导出人: {admin.email}'])
    writer.writerow([f'记录数量: {len(users)}'])
    writer.writerow([])  # 空行

    # 写入表头
    writer.writerow([
        '用户ID', '邮箱地址', '昵称', '管理员', '账户状态',
        '积分余额', '注册时间', '最后登录时间', '登录IP', '备注'
    ])

    # 写入数据
    for user in users:
        writer.writerow([
            user.id,
            user.email,
            user.nickname or '-',
            '管理员' if user.is_admin else '普通用户',
            '正常' if user.is_active else '已禁用',
            user.credit_balance,
            user.created_at.strftime('%Y-%m-%d %H:%M:%S') if user.created_at else '-',
            user.last_login_at.strftime('%Y-%m-%d %H:%M:%S') if user.last_login_at else '-',
            user.last_login_ip or '-',
            user.note or '-',
        ])

    # 记录导出操作
    logger.info("Admin %s exported %s users", admin.email, len(users))

    # 返回 CSV 文件
    output.seek(0)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type='text/csv; charset=utf-8-sig',
        headers={
            'Content-Disposition': f"attachment; filename=NanoBanana_用户_{timestamp}.csv"
        }
    )


@router.get("/security/login-failures", response_model=LoginFailureResponse)
async def get_login_failures(
    limit: int = Query(50, ge=1, le=200, description="返回数量限制"),
    admin: User = Depends(get_admin_user),
):
    """
    获取登录失败的 IP 列表

    Args:
        limit: 返回数量限制

    Returns:
        登录失败记录列表
    """
    if not redis_client:
        return LoginFailureResponse(items=[], total=0)

    cursor = "0"
    keys: list[str] = []
    pattern = f"{LOGIN_FAIL_IP_KEY_PREFIX}*"
    while True:
        cursor, batch = await redis_client.scan(cursor=cursor, match=pattern, count=200)
        keys.extend(batch)
        if cursor == 0 or cursor == "0":
            break

    ips: list[str] = []
    for key in keys:
        if key.startswith(LOGIN_FAIL_IP_KEY_PREFIX):
            ips.append(key[len(LOGIN_FAIL_IP_KEY_PREFIX):])

    items: list[LoginFailureItem] = []
    if ips:
        async with redis_client.pipeline() as pipe:
            for ip in ips:
                pipe.get(f"{LOGIN_FAIL_IP_KEY_PREFIX}{ip}")
                pipe.get(f"{LOGIN_FAIL_IP_TS_PREFIX}{ip}")
                pipe.get(f"{LOGIN_FAIL_IP_EMAIL_PREFIX}{ip}")
                pipe.ttl(f"{LOGIN_FAIL_IP_KEY_PREFIX}{ip}")
            results = await pipe.execute()

        for index, ip in enumerate(ips):
            base = index * 4
            count_raw = results[base]
            if not count_raw:
                continue
            count = int(count_raw)
            if count <= 0:
                continue
            last_ts_raw = results[base + 1]
            last_seen = datetime.utcfromtimestamp(int(last_ts_raw)) if last_ts_raw else None
            last_email = results[base + 2]
            ttl_raw = results[base + 3]
            ttl_seconds = ttl_raw if ttl_raw is not None and ttl_raw >= 0 else None
            items.append(
                LoginFailureItem(
                    ip=ip,
                    count=count,
                    last_seen=last_seen,
                    last_email=last_email,
                    ttl_seconds=ttl_seconds,
                )
            )

    items.sort(key=lambda item: (item.count, item.last_seen or datetime.min), reverse=True)
    return LoginFailureResponse(items=items[:limit], total=len(items))
