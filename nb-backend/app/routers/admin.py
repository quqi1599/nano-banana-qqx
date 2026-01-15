"""
管理后台路由
"""
import uuid
import hashlib
import json
import logging
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update

from app.database import get_db
from app.models.user import User
from app.models.token_pool import TokenPool
from app.models.redeem_code import RedeemCode, generate_redeem_code
from app.models.usage_log import UsageLog
from app.models.model_pricing import ModelPricing
from app.schemas.admin import (
    TokenPoolCreate,
    TokenPoolResponse,
    TokenPoolUpdate,
    ModelPricingCreate,
    ModelPricingUpdate,
    ModelPricingResponse,
    UserListResponse,
    AdminUserResponse,
    DashboardStats,
    DailyStats,
    ModelStats,
    UserNoteUpdate,
    EmailConfigResponse,
    EmailConfigUpdate,
    SmtpConfigResponse,
    SmtpConfigUpdate,
    UserStatsResponse,
    UserStatusUpdate,
    BatchStatusUpdate,
    BatchCreditsUpdate,
    CreditHistoryResponse,
    AdminActionConfirmRequest,
    AdminActionConfirmResponse,
    UserTagsUpdate,
    UserTagsResponse,
)
from app.schemas.redeem import GenerateCodesRequest, GenerateCodesResponse, RedeemCodeInfo
from app.utils.security import get_admin_user, get_current_user, verify_password
from app.utils.balance_utils import check_api_key_quota
from app.utils.token_security import (
    build_key_parts,
    decrypt_api_key,
    encrypt_api_key,
    hash_api_key,
    mask_key_parts,
)
from app.utils.cache import get_cached_json, set_cached_json, delete_cache
from app.utils.redis_client import redis_client
from app.config import get_settings
from app.models.admin_audit_log import AdminAuditLog

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()

TOKEN_POOL_CACHE_KEY = "token_pool:list:v1"
TOKEN_POOL_CACHE_TTL_SECONDS = 60
ADMIN_CONFIRM_KEY_PREFIX = "admin:confirm:"
ADMIN_CONFIRM_PURPOSES = {"batch_status", "batch_credits"}


def _normalize_reason(reason: str) -> str:
    cleaned = reason.strip()
    if len(cleaned) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="操作原因至少 4 个字符",
        )
    return cleaned


async def _verify_admin_confirm_token(
    admin: User,
    purpose: str,
    token: str,
    request: Request,
) -> None:
    if purpose not in ADMIN_CONFIRM_PURPOSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不支持的确认类型",
        )

    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要二次确认令牌",
        )

    if not redis_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="确认服务不可用",
        )

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    key = f"{ADMIN_CONFIRM_KEY_PREFIX}{admin.id}:{purpose}:{token_hash}"
    raw = await redis_client.get(key)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="二次确认已过期或无效",
        )

    try:
        payload = json.loads(raw)
    except Exception:
        payload = {}

    ip = request.client.host if request.client else None
    if payload.get("ip") and ip and payload.get("ip") != ip:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="二次确认令牌无效",
        )

    await redis_client.delete(key)


def _record_admin_audit(
    db: AsyncSession,
    admin: User,
    action: str,
    target_type: str,
    target_ids: Optional[list[str]],
    reason: Optional[str],
    status_text: str,
    request: Request,
    details: Optional[dict[str, Any]] = None,
) -> None:
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    audit = AdminAuditLog(
        admin_id=admin.id,
        action=action,
        target_type=target_type,
        target_ids=target_ids,
        target_count=len(target_ids or []),
        reason=reason,
        status=status_text,
        ip_address=ip,
        user_agent=user_agent,
        details=details,
    )
    db.add(audit)

def token_response(token: TokenPool) -> TokenPoolResponse:
    token_dict = TokenPoolResponse.model_validate(token).model_dump()
    if token.api_key_prefix or token.api_key_suffix:
        token_dict["api_key"] = mask_key_parts(
            token.api_key_prefix or "", token.api_key_suffix or ""
        )
    else:
        try:
            plain_key = decrypt_api_key(token.api_key)
            prefix, suffix = build_key_parts(plain_key)
            token_dict["api_key"] = mask_key_parts(prefix, suffix)
        except Exception:
            token_dict["api_key"] = "***"
    return TokenPoolResponse(**token_dict)


# ============ 初始化管理员 ============

@router.post("/init-admin")
async def init_first_admin(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    将当前用户设置为管理员
    要求：
    1. 用户邮箱必须在配置的管理员邮箱列表中 (admin_emails)
    2. 数据库中尚未有管理员（首次初始化）
    """
    # 生产环境要求初始化令牌
    if settings.is_production() and not settings.admin_init_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="生产环境禁止无初始化令牌的管理员创建",
        )

    if settings.admin_init_token:
        init_token = request.headers.get("X-Admin-Init-Token", "")
        if init_token != settings.admin_init_token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="初始化令牌无效",
            )

    # 获取配置的管理员邮箱列表
    allowed_emails = [e.strip().lower() for e in settings.admin_emails.split(',') if e.strip()]

    if not allowed_emails:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="系统未配置管理员邮箱列表，请联系系统管理员",
        )

    # 检查当前用户邮箱是否在白名单中
    if current_user.email.lower() not in allowed_emails:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"您的邮箱无权成为管理员。如有疑问，请联系系统管理员。",
        )

    # 检查是否已有管理员
    admin_result = await db.execute(select(User).where(User.is_admin == True))
    existing_admin = admin_result.scalar_one_or_none()

    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"管理员已存在 ({existing_admin.email})，无法初始化",
        )

    # 将当前用户设为管理员
    current_user.is_admin = True
    _record_admin_audit(
        db=db,
        admin=current_user,
        action="init_admin",
        target_type="user",
        target_ids=[current_user.id],
        reason=None,
        status_text="success",
        request=request,
        details={"initialized": True},
    )
    await db.commit()

    logger.info(f"用户 {current_user.email} 已初始化为管理员")
    return {
        "message": "已设置为管理员",
        "email": current_user.email,
        "is_admin": True
    }


@router.post("/confirm-action", response_model=AdminActionConfirmResponse)
async def confirm_admin_action(
    request: Request,
    data: AdminActionConfirmRequest,
    admin: User = Depends(get_admin_user),
):
    """管理员敏感操作二次确认"""
    if data.purpose not in ADMIN_CONFIRM_PURPOSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不支持的确认类型",
        )

    if not verify_password(data.password, admin.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="管理员密码错误",
        )

    if not redis_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="确认服务不可用",
        )

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    key = f"{ADMIN_CONFIRM_KEY_PREFIX}{admin.id}:{data.purpose}:{token_hash}"
    payload = {
        "ip": request.client.host if request and request.client else None,
        "ua": request.headers.get("user-agent") if request else None,
        "ts": int(time.time()),
    }
    ttl = max(30, int(settings.admin_action_confirm_ttl_seconds))
    await redis_client.set(key, json.dumps(payload), ex=ttl)

    return AdminActionConfirmResponse(confirm_token=token, expires_in=ttl)


# ============ Token 池管理 ============

@router.get("/tokens", response_model=list[TokenPoolResponse])
async def list_tokens(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取所有 Token"""
    cached = await get_cached_json(TOKEN_POOL_CACHE_KEY)
    if cached is not None:
        return cached

    result = await db.execute(
        select(TokenPool).order_by(TokenPool.priority.desc())
    )
    tokens = result.scalars().all()
    response = [token_response(token) for token in tokens]

    await set_cached_json(
        TOKEN_POOL_CACHE_KEY,
        [item.model_dump(mode="json") for item in response],
        TOKEN_POOL_CACHE_TTL_SECONDS,
    )
    return response


@router.post("/tokens", response_model=TokenPoolResponse)
async def add_token(
    data: TokenPoolCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """添加新 Token"""
    # 检查是否已存在
    key_hash = hash_api_key(data.api_key)
    result = await db.execute(
        select(TokenPool).where(
            (TokenPool.api_key_hash == key_hash) | (TokenPool.api_key == data.api_key)
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该 Token 已存在",
        )
    
    # 创建 Token
    prefix, suffix = build_key_parts(data.api_key)
    token = TokenPool(
        name=data.name,
        api_key=encrypt_api_key(data.api_key),
        api_key_hash=key_hash,
        api_key_prefix=prefix,
        api_key_suffix=suffix,
        priority=data.priority,
        base_url=data.base_url.strip() if data.base_url else None,
    )
    
    # 尝试查询额度
    try:
        settings = get_settings()
        base_url = data.base_url.strip() if data.base_url else None
        quota = await check_api_key_quota(
            data.api_key, base_url or settings.newapi_base_url
        )
        if quota is not None:
            token.remaining_quota = quota
            token.last_checked_at = datetime.utcnow()
            logger.info(f"Token {data.name} 额度查询成功: {quota}")
    except Exception as e:
        logger.warning(f"Token {data.name} 额度查询失败: {e}")
    
    db.add(token)
    await db.commit()
    await db.refresh(token)
    await delete_cache(TOKEN_POOL_CACHE_KEY)
    logger.info("Admin %s added token %s", admin.email, token.id)
    
    return token_response(token)


@router.post("/tokens/{token_id}/check-quota", response_model=TokenPoolResponse)
async def check_token_quota(
    token_id: str,
    base_url: Optional[str] = Query(default=None),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """检查 Token 额度"""
    result = await db.execute(select(TokenPool).where(TokenPool.id == token_id))
    token = result.scalar_one_or_none()
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token 不存在",
        )
    
    # 查询额度（使用完整的 API Key）
    try:
        settings = get_settings()
        resolved_base_url = base_url.strip() if base_url else None
        token_base_url = token.base_url.strip() if token.base_url else None
        plain_key = decrypt_api_key(token.api_key)
        quota = await check_api_key_quota(
            plain_key, resolved_base_url or token_base_url or settings.newapi_base_url
        )
        if quota is not None:
            token.remaining_quota = quota
            token.last_checked_at = datetime.utcnow()
            await db.commit()
            await db.refresh(token)
            await delete_cache(TOKEN_POOL_CACHE_KEY)
            logger.info(f"Token {token.name} 额度更新为: {quota}")
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无法获取额度信息，请检查 API Key 是否有效",
            )
    except HTTPException:
        raise
    except RuntimeError as e:
        logger.error(f"Token {token.name} 额度查询失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token 解密失败，请检查密钥配置",
        )
    except Exception as e:
        logger.error(f"Token {token.name} 额度查询失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"额度查询失败: {str(e)}",
        )
    
    # 返回时隐藏部分 API Key
    return token_response(token)


@router.put("/tokens/{token_id}", response_model=TokenPoolResponse)
async def update_token(
    token_id: str,
    data: TokenPoolUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新 Token"""
    result = await db.execute(select(TokenPool).where(TokenPool.id == token_id))
    token = result.scalar_one_or_none()
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token 不存在",
        )
    
    if data.name is not None:
        token.name = data.name
    if data.is_active is not None:
        token.is_active = data.is_active
    if data.priority is not None:
        token.priority = data.priority
    if data.base_url is not None:
        token.base_url = data.base_url.strip() or None
    
    await db.commit()
    await db.refresh(token)
    await delete_cache(TOKEN_POOL_CACHE_KEY)
    logger.info("Admin %s updated token %s", admin.email, token.id)
    
    return token_response(token)


@router.delete("/tokens/{token_id}")
async def delete_token(
    token_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """删除 Token"""
    result = await db.execute(select(TokenPool).where(TokenPool.id == token_id))
    token = result.scalar_one_or_none()
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token 不存在",
        )
    
    await db.delete(token)
    await db.commit()
    await delete_cache(TOKEN_POOL_CACHE_KEY)
    logger.info("Admin %s deleted token %s", admin.email, token.id)
    
    return {"message": "删除成功"}


# ============ 模型计费 ============

@router.get("/model-pricing", response_model=list[ModelPricingResponse])
async def list_model_pricing(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取模型计费配置"""
    result = await db.execute(
        select(ModelPricing).order_by(ModelPricing.model_name.asc())
    )
    return [ModelPricingResponse.model_validate(p) for p in result.scalars().all()]


@router.post("/model-pricing", response_model=ModelPricingResponse)
async def create_model_pricing(
    data: ModelPricingCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """新增模型计费配置"""
    if data.credits_per_request <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="扣点次数必须大于 0",
        )

    result = await db.execute(
        select(ModelPricing).where(ModelPricing.model_name == data.model_name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="模型已存在，请直接修改",
        )

    pricing = ModelPricing(
        model_name=data.model_name,
        credits_per_request=data.credits_per_request,
    )
    db.add(pricing)
    await db.commit()
    await db.refresh(pricing)

    return ModelPricingResponse.model_validate(pricing)


@router.put("/model-pricing/{pricing_id}", response_model=ModelPricingResponse)
async def update_model_pricing(
    pricing_id: str,
    data: ModelPricingUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新模型计费配置"""
    if data.credits_per_request <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="扣点次数必须大于 0",
        )

    result = await db.execute(
        select(ModelPricing).where(ModelPricing.id == pricing_id)
    )
    pricing = result.scalar_one_or_none()
    if not pricing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="计费配置不存在",
        )

    pricing.credits_per_request = data.credits_per_request
    await db.commit()
    await db.refresh(pricing)

    return ModelPricingResponse.model_validate(pricing)


# ============ 兑换码管理 ============

@router.post("/redeem-codes/generate", response_model=GenerateCodesResponse)
async def generate_redeem_codes(
    data: GenerateCodesRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """批量生成兑换码"""
    batch_id = str(uuid.uuid4())
    expires_at = None
    if data.expires_days:
        expires_at = datetime.utcnow() + timedelta(days=data.expires_days)

    codes = []
    for _ in range(data.count):
        code = RedeemCode(
            credit_amount=data.credit_amount,
            pro3_credits=data.pro3_credits,
            flash_credits=data.flash_credits,
            remark=data.remark,
            batch_id=batch_id,
            expires_at=expires_at,
        )
        db.add(code)
        codes.append(code.code)

    await db.commit()

    return GenerateCodesResponse(
        batch_id=batch_id,
        codes=codes,
        count=data.count,
        credit_amount=data.credit_amount,
        pro3_credits=data.pro3_credits,
        flash_credits=data.flash_credits,
        remark=data.remark,
    )


@router.get("/redeem-codes", response_model=list[RedeemCodeInfo])
async def list_redeem_codes(
    batch_id: Optional[str] = None,
    is_used: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取兑换码列表"""
    query = select(RedeemCode)
    
    if batch_id:
        query = query.where(RedeemCode.batch_id == batch_id)
    if is_used is not None:
        query = query.where(RedeemCode.is_used == is_used)
    
    query = query.order_by(RedeemCode.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    codes = result.scalars().all()
    
    return [RedeemCodeInfo.model_validate(c) for c in codes]


# ============ 用户管理 ============

@router.get("/users", response_model=UserListResponse)
async def list_users(
    search: Optional[str] = None,
    is_admin: Optional[bool] = None,
    is_active: Optional[bool] = None,
    min_balance: Optional[int] = None,
    max_balance: Optional[int] = None,
    created_after: Optional[str] = None,
    created_before: Optional[str] = None,
    login_after: Optional[str] = None,
    login_before: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户列表（支持高级筛选）"""
    # 构建查询
    query = select(User)

    # 搜索筛选
    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) |
            (User.nickname.ilike(f"%{search}%"))
        )

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

    # 获取总数（应用相同的筛选条件）
    count_query = select(func.count(User.id))

    if search:
        count_query = count_query.where(
            (User.email.ilike(f"%{search}%")) |
            (User.nickname.ilike(f"%{search}%"))
        )
    if is_admin is not None:
        count_query = count_query.where(User.is_admin == is_admin)
    if is_active is not None:
        count_query = count_query.where(User.is_active == is_active)
    if min_balance is not None:
        count_query = count_query.where(User.credit_balance >= min_balance)
    if max_balance is not None:
        count_query = count_query.where(User.credit_balance <= max_balance)
    if created_after:
        try:
            after_date = datetime.strptime(created_after, "%Y-%m-%d")
            count_query = count_query.where(User.created_at >= after_date)
        except ValueError:
            pass
    if created_before:
        try:
            before_date = datetime.strptime(created_before, "%Y-%m-%d")
            before_date = before_date.replace(hour=23, minute=59, second=59)
            count_query = count_query.where(User.created_at <= before_date)
        except ValueError:
            pass
    if login_after:
        try:
            after_date = datetime.strptime(login_after, "%Y-%m-%d")
            count_query = count_query.where(User.last_login_at >= after_date)
        except ValueError:
            pass
    if login_before:
        try:
            before_date = datetime.strptime(login_before, "%Y-%m-%d")
            before_date = before_date.replace(hour=23, minute=59, second=59)
            count_query = count_query.where(User.last_login_at <= before_date)
        except ValueError:
            pass

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


@router.put("/users/{user_id}/credits")
async def adjust_user_credits(
    user_id: str,
    amount: int,
    reason: str = "管理员调整",
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """调整用户积分"""
    from app.models.credit import CreditTransaction, TransactionType
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )
    
    user.credit_balance += amount
    
    transaction = CreditTransaction(
        user_id=user.id,
        amount=amount,
        type=TransactionType.BONUS.value if amount > 0 else TransactionType.CONSUME.value,
        description=reason,
        balance_after=user.credit_balance,
    )
    db.add(transaction)
    
    await db.commit()
    
    return {"message": "调整成功", "new_balance": user.credit_balance}


@router.put("/users/{user_id}/note")
async def update_user_note(
    user_id: str,
    data: UserNoteUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新用户备注"""
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


@router.put("/users/{user_id}/tags")
async def update_user_tags(
    user_id: str,
    data: UserTagsUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新用户标签"""
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


@router.get("/users/tags", response_model=UserTagsResponse)
async def get_all_user_tags(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取所有用户标签及其统计"""
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


@router.get("/users/stats", response_model=UserStatsResponse)
async def get_users_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户统计概览"""
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


@router.get("/users/{user_id}/credit-history", response_model=CreditHistoryResponse)
async def get_user_credit_history(
    user_id: str,
    limit: int = Query(3, ge=1, le=50),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户积分调整历史"""
    from app.models.credit import CreditTransaction

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

    # 获取历史记录
    result = await db.execute(
        select(CreditTransaction)
        .where(CreditTransaction.user_id == user_id)
        .order_by(CreditTransaction.created_at.desc())
        .limit(limit)
    )
    items = result.scalars().all()

    return CreditHistoryResponse(items=items, total=total)


@router.put("/users/{user_id}/active")
async def set_user_active_status(
    request: Request,
    user_id: str,
    data: UserStatusUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """设置用户激活状态"""
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
    """批量设置用户状态"""
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
    await db.commit()

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
    """批量调整用户积分"""
    from app.models.credit import CreditTransaction, TransactionType

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
    for user in users:
        old_balance = user.credit_balance
        user.credit_balance += data.amount

        # 防止余额为负
        if user.credit_balance < 0:
            user.credit_balance = 0

        # 记录交易
        transaction = CreditTransaction(
            user_id=user.id,
            amount=data.amount,
            type=TransactionType.BONUS.value if data.amount > 0 else TransactionType.CONSUME.value,
            description=reason,
            balance_after=user.credit_balance,
        )
        db.add(transaction)
        updated_count += 1
        updated_ids.append(user.id)

    _record_admin_audit(
        db=db,
        admin=admin,
        action="batch_adjust_credits",
        target_type="user",
        target_ids=updated_ids,
        reason=reason,
        status_text="success",
        request=request,
        details={
            "requested_count": len(data.user_ids),
            "updated_count": updated_count,
            "amount": data.amount,
            "total_delta": data.amount * updated_count,
        },
    )
    await db.commit()

    logger.info(
        f"Admin {admin.email} batch adjusted credits for {updated_count} users, amount={data.amount}, reason: {reason}"
    )

    return {
        "message": f"已调整 {updated_count} 个用户的积分",
        "updated_count": updated_count,
    }


@router.get("/users/export")
async def export_users(
    search: Optional[str] = None,
    is_admin: Optional[bool] = None,
    is_active: Optional[bool] = None,
    min_balance: Optional[int] = None,
    max_balance: Optional[int] = None,
    created_after: Optional[str] = None,
    created_before: Optional[str] = None,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """导出用户数据为 CSV"""
    from fastapi.responses import StreamingResponse
    import io
    import csv

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
    result = await db.execute(query)
    users = result.scalars().all()

    # 创建 CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # 写入 BOM 以支持 Excel 中文
    output.write('\ufeff')

    # 写入表头
    writer.writerow([
        '用户ID', '邮箱', '昵称', '管理员', '状态', '余额',
        '注册时间', '最后登录', '登录IP', '备注'
    ])

    # 写入数据
    for user in users:
        writer.writerow([
            user.id,
            user.email,
            user.nickname or '',
            '是' if user.is_admin else '否',
            '启用' if user.is_active else '禁用',
            user.credit_balance,
            user.created_at.strftime('%Y-%m-%d %H:%M:%S') if user.created_at else '',
            user.last_login_at.strftime('%Y-%m-%d %H:%M:%S') if user.last_login_at else '',
            user.last_login_ip or '',
            user.note or '',
        ])

    # 记录导出操作
    logger.info(f"Admin {admin.email} exported {len(users)} users")

    # 返回 CSV 文件
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        media_type='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename=users_export_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.csv'
        }
    )


# ============ 邮箱白名单管理 ============

from app.models.email_whitelist import EmailWhitelist
from pydantic import BaseModel


class EmailWhitelistCreate(BaseModel):
    suffix: str  # 如 @qq.com


class EmailWhitelistResponse(BaseModel):
    id: str
    suffix: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/email-whitelist", response_model=list[EmailWhitelistResponse])
async def list_email_whitelist(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取邮箱后缀白名单"""
    result = await db.execute(
        select(EmailWhitelist).order_by(EmailWhitelist.created_at.desc())
    )
    return [EmailWhitelistResponse.model_validate(w) for w in result.scalars().all()]


@router.post("/email-whitelist", response_model=EmailWhitelistResponse)
async def add_email_whitelist(
    data: EmailWhitelistCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """添加邮箱后缀白名单"""
    suffix = data.suffix.strip().lower()
    if not suffix.startswith("@"):
        suffix = "@" + suffix
    
    # 检查是否已存在
    result = await db.execute(
        select(EmailWhitelist).where(EmailWhitelist.suffix == suffix)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该后缀已存在",
        )
    
    whitelist = EmailWhitelist(suffix=suffix)
    db.add(whitelist)
    await db.commit()
    await db.refresh(whitelist)
    
    return EmailWhitelistResponse.model_validate(whitelist)


@router.put("/email-whitelist/{whitelist_id}")
async def toggle_email_whitelist(
    whitelist_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """切换邮箱后缀白名单状态"""
    result = await db.execute(
        select(EmailWhitelist).where(EmailWhitelist.id == whitelist_id)
    )
    whitelist = result.scalar_one_or_none()
    
    if not whitelist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="白名单不存在",
        )
    
    whitelist.is_active = not whitelist.is_active
    await db.commit()
    
    return {"message": "状态已切换", "is_active": whitelist.is_active}


@router.delete("/email-whitelist/{whitelist_id}")
async def delete_email_whitelist(
    whitelist_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """删除邮箱后缀白名单"""
    result = await db.execute(
        select(EmailWhitelist).where(EmailWhitelist.id == whitelist_id)
    )
    whitelist = result.scalar_one_or_none()
    
    if not whitelist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="白名单不存在",
        )
    
    await db.delete(whitelist)
    await db.commit()

    return {"message": "删除成功"}


# ============ 邮件配置管理 ============

from app.models.email_config import EmailConfig
from app.config import get_settings

settings = get_settings()


@router.get("/email-config", response_model=list[EmailConfigResponse])
async def list_email_config(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取所有邮件配置"""
    result = await db.execute(
        select(EmailConfig).order_by(EmailConfig.email_type.asc())
    )
    configs = result.scalars().all()

    # 如果没有任何配置，初始化默认配置
    if not configs:
        default_configs = []
        for email_type, label in EmailConfig.EMAIL_TYPES.items():
            config = EmailConfig(
                email_type=email_type,
                from_name="DEAI",
                is_enabled=True,
            )
            db.add(config)
            default_configs.append(config)
        await db.commit()
        configs = default_configs

    # 添加类型标签
    response = []
    for config in configs:
        config_dict = EmailConfigResponse.model_validate(config).model_dump()
        config_dict["email_type_label"] = EmailConfig.EMAIL_TYPES.get(config.email_type, config.email_type)
        response.append(EmailConfigResponse(**config_dict))

    return response


@router.put("/email-config/{email_type}", response_model=EmailConfigResponse)
async def update_email_config(
    email_type: str,
    data: EmailConfigUpdate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """更新邮件配置"""
    # 检查邮件类型是否有效
    if email_type not in EmailConfig.EMAIL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的邮件类型，支持的类型: {list(EmailConfig.EMAIL_TYPES.keys())}",
        )

    result = await db.execute(
        select(EmailConfig).where(EmailConfig.email_type == email_type)
    )
    config = result.scalar_one_or_none()

    # 如果不存在则创建
    if not config:
        config = EmailConfig(email_type=email_type)
        db.add(config)

    # 更新配置
    if data.from_name is not None:
        config.from_name = data.from_name
    if data.from_email is not None:
        config.from_email = data.from_email
    if data.subject_template is not None:
        config.subject_template = data.subject_template
    if data.is_enabled is not None:
        config.is_enabled = data.is_enabled

    await db.commit()
    await db.refresh(config)

    config_dict = EmailConfigResponse.model_validate(config).model_dump()
    config_dict["email_type_label"] = EmailConfig.EMAIL_TYPES.get(config.email_type, config.email_type)
    return EmailConfigResponse(**config_dict)


@router.get("/smtp-config", response_model=SmtpConfigResponse)
async def get_smtp_config(
    admin: User = Depends(get_admin_user),
):
    """获取SMTP配置"""
    return SmtpConfigResponse(
        smtp_host=settings.aliyun_smtp_host,
        smtp_port=settings.aliyun_smtp_port,
        smtp_user=settings.aliyun_smtp_user,
        from_name=settings.aliyun_email_from_name,
        is_configured=bool(settings.aliyun_smtp_user and settings.aliyun_smtp_password),
    )


@router.put("/smtp-config")
async def update_smtp_config(
    data: SmtpConfigUpdate,
    admin: User = Depends(get_admin_user),
):
    """更新SMTP配置（需要重启服务生效）"""
    # 注意：这里只是示例，实际应该更新.env文件或数据库
    # 由于环境变量运行时不可修改，这里返回提示
    return {
        "message": "SMTP配置需要通过环境变量或.env文件修改，请重启服务后生效",
        "config": {
            "smtp_host": data.smtp_host,
            "smtp_port": data.smtp_port,
            "from_name": data.from_name,
        }
    }


@router.post("/email-config/test-send")
async def test_send_email(
    email_type: str = Query(..., description="邮件类型"),
    test_email: str = Query(..., description="测试接收邮箱"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """测试发送邮件"""
    from app.services.email_service import send_verification_code, send_ticket_reply_notification

    # 检查邮件类型
    if email_type not in EmailConfig.EMAIL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的邮件类型: {email_type}",
        )

    # 根据类型发送测试邮件
    test_code = "123456"
    success = False

    if email_type == "register":
        success = send_verification_code(test_email, test_code, "register")
    elif email_type == "reset":
        success = send_verification_code(test_email, test_code, "reset")
    elif email_type == "ticket_reply":
        success = send_ticket_reply_notification(test_email, "测试工单标题", "这是一条测试回复内容")
    else:
        # 其他类型使用注册模板测试
        success = send_verification_code(test_email, test_code, "register")

    return {
        "success": success,
        "message": "测试邮件发送成功" if success else "测试邮件发送失败，请检查SMTP配置"
    }


# ============ 对话历史管理 ============

from app.models.conversation import Conversation, ConversationMessage
from app.schemas.conversation import AdminConversationResponse, AdminConversationDetailResponse
from sqlalchemy.orm import selectinload


@router.get("/conversations")
async def list_conversations(
    user_id: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    model_name: Optional[str] = None,
    min_messages: Optional[int] = None,
    max_messages: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取所有用户的对话列表（支持高级筛选）"""
    # 构建查询
    query = (
        select(Conversation, User.email, User.nickname)
        .outerjoin(User, Conversation.user_id == User.id)
    )

    # 用户筛选
    if user_id:
        query = query.where(Conversation.user_id == user_id)

    # 搜索筛选（按用户邮箱或对话标题）
    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) |
            (Conversation.title.ilike(f"%{search}%"))
        )

    # 时间范围筛选
    if date_from:
        try:
            from datetime import datetime
            after_date = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.where(Conversation.created_at >= after_date)
        except ValueError:
            pass

    if date_to:
        try:
            from datetime import datetime
            before_date = datetime.strptime(date_to, "%Y-%m-%d")
            # 包含当天，所以加一天
            before_date = before_date.replace(hour=23, minute=59, second=59)
            query = query.where(Conversation.created_at <= before_date)
        except ValueError:
            pass

    # 模型筛选
    if model_name:
        query = query.where(Conversation.model_name == model_name)

    # 消息数量范围筛选
    if min_messages is not None:
        query = query.where(Conversation.message_count >= min_messages)
    if max_messages is not None:
        query = query.where(Conversation.message_count <= max_messages)

    # 获取总数（应用相同的筛选条件）
    count_query = select(func.count(Conversation.id)).select_from(Conversation)
    count_query = count_query.outerjoin(User, Conversation.user_id == User.id)

    if user_id:
        count_query = count_query.where(Conversation.user_id == user_id)
    if search:
        count_query = count_query.where(
            (User.email.ilike(f"%{search}%")) |
            (Conversation.title.ilike(f"%{search}%"))
        )
    if date_from:
        try:
            from datetime import datetime
            after_date = datetime.strptime(date_from, "%Y-%m-%d")
            count_query = count_query.where(Conversation.created_at >= after_date)
        except ValueError:
            pass
    if date_to:
        try:
            from datetime import datetime
            before_date = datetime.strptime(date_to, "%Y-%m-%d")
            before_date = before_date.replace(hour=23, minute=59, second=59)
            count_query = count_query.where(Conversation.created_at <= before_date)
        except ValueError:
            pass
    if model_name:
        count_query = count_query.where(Conversation.model_name == model_name)
    if min_messages is not None:
        count_query = count_query.where(Conversation.message_count >= min_messages)
    if max_messages is not None:
        count_query = count_query.where(Conversation.message_count <= max_messages)

    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # 分页和排序
    query = query.order_by(Conversation.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    # 构建响应
    response = []
    for conv, user_email, user_nickname in rows:
        conv_dict = AdminConversationResponse.model_validate(conv).model_dump()
        conv_dict["user_email"] = user_email or "未知用户"
        conv_dict["user_nickname"] = user_nickname
        response.append(AdminConversationResponse(**conv_dict))

    return JSONResponse(
        content={
            "conversations": [r.model_dump(mode="json") for r in response],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@router.get("/conversations/{conversation_id}", response_model=AdminConversationDetailResponse)
async def get_conversation_detail(
    conversation_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """管理员查看对话详情"""
    result = await db.execute(
        select(Conversation, User.email, User.nickname)
        .outerjoin(User, Conversation.user_id == User.id)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    row = result.first()
    
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )
    
    conversation, user_email, user_nickname = row
    conv_dict = AdminConversationDetailResponse.model_validate(conversation).model_dump()
    conv_dict["user_email"] = user_email or "未知用户"
    conv_dict["user_nickname"] = user_nickname
    return AdminConversationDetailResponse(**conv_dict)


@router.delete("/conversations/{conversation_id}")
async def delete_conversation_admin(
    conversation_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """管理员删除对话"""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    await db.delete(conversation)
    await db.commit()

    return {"message": "删除成功"}


# ============ 用户对话统计 ============

from app.schemas.admin import (
    UserConversationStats,
    ConversationTimelineItem,
    ConversationTimelineResponse,
)


@router.get("/users/{user_id}/conversation-stats", response_model=UserConversationStats)
async def get_user_conversation_stats(
    user_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户对话统计"""
    # 验证用户存在
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    # 总对话数
    total_conv_result = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.user_id == user_id)
    )
    total_conversations = total_conv_result.scalar() or 0

    # 总消息数（通过对话表汇总）
    total_msg_result = await db.execute(
        select(func.sum(Conversation.message_count)).where(Conversation.user_id == user_id)
    )
    total_messages = total_msg_result.scalar() or 0

    # 按模型分类统计
    model_result = await db.execute(
        select(Conversation.model_name, func.count(Conversation.id))
        .where(Conversation.user_id == user_id)
        .where(Conversation.model_name.isnot(None))
        .group_by(Conversation.model_name)
    )
    model_breakdown = {row[0]: row[1] for row in model_result.all()}

    # 最近活动时间
    last_activity_result = await db.execute(
        select(func.max(Conversation.updated_at)).where(Conversation.user_id == user_id)
    )
    last_activity = last_activity_result.scalar()

    # 最活跃的日期（对话数最多的日期）
    from sqlalchemy import cast, Date
    activity_result = await db.execute(
        select(cast(Conversation.created_at, Date), func.count(Conversation.id))
        .where(Conversation.user_id == user_id)
        .group_by(cast(Conversation.created_at, Date))
        .order_by(func.count(Conversation.id).desc())
        .limit(1)
    )
    most_active_row = activity_result.first()
    most_active_day = str(most_active_row[0]) if most_active_row else None

    return UserConversationStats(
        total_conversations=total_conversations,
        total_messages=total_messages,
        model_breakdown=model_breakdown,
        last_activity=last_activity,
        most_active_day=most_active_day,
    )


@router.get("/users/{user_id}/conversation-timeline", response_model=ConversationTimelineResponse)
async def get_user_conversation_timeline(
    user_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户对话时间线（按天分组）"""
    # 验证用户存在
    user_result = await db.execute(select(User).where(User.id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    from sqlalchemy import cast, Date, desc

    # 获取所有不同日期的对话统计
    date_query = (
        select(
            cast(Conversation.created_at, Date).label("date"),
            func.count(Conversation.id).label("conv_count"),
            func.sum(Conversation.message_count).label("msg_count"),
        )
        .where(Conversation.user_id == user_id)
        .group_by(cast(Conversation.created_at, Date))
        .order_by(desc(cast(Conversation.created_at, Date)))
    )

    # 获取总日期数
    count_result = await db.execute(
        select(func.count(func.distinct(cast(Conversation.created_at, Date))))
        .where(Conversation.user_id == user_id)
    )
    total_days = count_result.scalar() or 0

    # 分页
    date_query = date_query.offset((page - 1) * page_size).limit(page_size)
    date_result = await db.execute(date_query)
    date_rows = date_result.all()

    # 构建时间线
    timeline = []
    for date_obj, conv_count, msg_count in date_rows:
        date_str = str(date_obj)

        # 获取该日期的所有对话
        convs_result = await db.execute(
            select(Conversation, User.email, User.nickname)
            .outerjoin(User, Conversation.user_id == User.id)
            .where(Conversation.user_id == user_id)
            .where(cast(Conversation.created_at, Date) == date_obj)
            .order_by(Conversation.created_at.desc())
        )
        conv_rows = convs_result.all()

        conversations = []
        for conv, user_email, user_nickname in conv_rows:
            conv_dict = AdminConversationResponse.model_validate(conv).model_dump()
            conv_dict["user_email"] = user_email or "未知用户"
            conv_dict["user_nickname"] = user_nickname
            conversations.append(AdminConversationResponse(**conv_dict))

        timeline.append(
            ConversationTimelineItem(
                date=date_str,
                conversation_count=conv_count,
                message_count=int(msg_count) if msg_count else 0,
                conversations=conversations,
            )
        )

    return ConversationTimelineResponse(
        timeline=timeline,
        total=total_days,
        page=page,
        page_size=page_size,
    )


# ============ 对话清理管理 ============

from app.services.conversation_cleanup import cleanup_old_conversations, get_cleanup_history


@router.post("/conversations/cleanup")
async def cleanup_conversations(
    dry_run: bool = Query(False, description="试运行，不实际删除"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """手动清理超过14天的对话"""
    result = await cleanup_old_conversations(db, dry_run=dry_run)
    return result


@router.get("/conversations/cleanup-history")
async def get_conversation_cleanup_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取对话清理历史记录"""
    from app.services.conversation_cleanup import get_cleanup_history as fetch_history

    records, total = await fetch_history(db, page, page_size)
    return {
        "records": records,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/conversations/cleanup-stats")
async def get_cleanup_stats(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取清理统计信息"""
    from app.services.conversation_cleanup import get_cutoff_time, RETENTION_DAYS
    from app.models.conversation_cleanup import ConversationCleanup
    from sqlalchemy import func, desc

    cutoff_time = get_cutoff_time()

    # 统计总清理次数
    total_cleanup_result = await db.execute(select(func.count(ConversationCleanup.id)))
    total_cleanup = total_cleanup_result.scalar() or 0

    # 统计总删除对话数和消息数
    stats_result = await db.execute(
        select(
            func.count(ConversationCleanup.id).label('conversations'),
            func.sum(ConversationCleanup.message_count).label('messages')
        )
    )
    stats = stats_result.first()

    # 最近一次清理时间
    recent_result = await db.execute(
        select(ConversationCleanup)
        .order_by(desc(ConversationCleanup.cleaned_at))
        .limit(1)
    )
    recent_cleanup = recent_result.scalar_one_or_none()

    return {
        "retention_days": RETENTION_DAYS,
        "cutoff_time": cutoff_time.strftime('%Y-%m-%d %H:%M:%S %Z'),
        "total_cleanup_records": total_cleanup,
        "total_conversations_deleted": stats.conversations if stats else 0,
        "total_messages_deleted": int(stats.messages) if stats and stats.messages else 0,
        "last_cleanup_time": recent_cleanup.cleaned_at.strftime('%Y-%m-%d %H:%M:%S') if recent_cleanup else None,
    }
