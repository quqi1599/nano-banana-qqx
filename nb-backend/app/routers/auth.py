"""
认证路由：注册、登录、验证码、密码管理
"""
from datetime import datetime, timedelta
import time
import re
import secrets
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from pydantic import BaseModel, EmailStr
import redis.asyncio as redis
from sqlalchemy.exc import IntegrityError
from fastapi.security import HTTPAuthorizationCredentials

from app.database import get_db
from app.models.user import User
from app.models.login_history import LoginHistory
from app.models.email_code import EmailCode
from app.schemas.user import UserRegister, UserLogin, UserResponse, TokenResponse
from app.utils.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    get_token_from_request,
    optional_security,
    revoke_token,
)
from app.config import get_settings
from app.utils.captcha import verify_captcha_ticket, hash_captcha_ticket
from app.utils.rate_limiter import RateLimiter
from app.utils.cache import get_cached_json, set_cached_json
from app.utils.redis_client import redis_client
from app.services.email_service_v2 import generate_code, send_verification_code_v2 as send_verification_code

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

# 限制发送验证码：每邮箱每分钟 5 次
send_code_limiter = RateLimiter(times=5, seconds=60)


# Redis 连接
async def get_redis():
    yield redis_client


# 安全限制常量（从配置读取）
IP_REGISTER_LIMIT = settings.ip_register_limit  # 每 IP 24小时最多注册次数
EMAIL_REGISTER_LIMIT = settings.email_register_limit  # 每邮箱 24小时最多注册次数
RESET_PASSWORD_EMAIL_LIMIT = settings.reset_password_email_limit  # 每邮箱 24小时最多重置密码次数
LOGIN_FAIL_LIMIT = settings.login_fail_limit  # 登录失败锁定次数
LIMIT_EXPIRE_SECONDS = 86400  # 24小时
CAPTCHA_TICKET_USED_PREFIX = "captcha:ticket:used:"
EMAIL_WHITELIST_CACHE_KEY = "email_whitelist:active:v1"
LOGIN_FAIL_IP_KEY_PREFIX = "login_fail_ip:"
LOGIN_FAIL_IP_TS_PREFIX = "login_fail_ip_ts:"
LOGIN_FAIL_IP_EMAIL_PREFIX = "login_fail_ip_email:"


def _get_client_ip(request: Request) -> str:
    """安全地获取客户端真实 IP 地址

    优先级:
    1. X-Forwarded-For 最左侧 IP (当 trust_proxy_headers=True)
    2. X-Real-IP (当 trust_proxy_headers=True)
    3. 直接连接的 IP

    注意: 只有在正确配置反向代理的情况下才应启用 trust_proxy_headers
    """
    # 获取直接连接的 IP 作为 fallback
    direct_ip = request.client.host if request.client else "unknown"

    if not settings.trust_proxy_headers:
        # 不信任代理头时，直接使用连接 IP
        return direct_ip

    # 信任代理时，从代理头中提取真实 IP
    # X-Forwarded-For 格式: "client, proxy1, proxy2"
    forwarded_for = request.headers.get("x-forwarded-for", "").strip()
    if forwarded_for:
        # 取最左侧的 IP（原始客户端 IP）
        # 注意：如果伪造代理头，攻击者可以控制这个值
        # 生产环境应该配置反向代理（如 nginx）来清理这个头
        ips = [ip.strip() for ip in forwarded_for.split(",") if ip.strip()]
        if ips:
            client_ip = ips[0]
            # 简单验证 IPv4/IPv6 格式，防止注入
            if _is_valid_ip(client_ip):
                return client_ip

    # 尝试 X-Real-IP 头
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip and _is_valid_ip(real_ip):
        return real_ip

    # Fallback: 使用直接连接的 IP
    return direct_ip


def _is_valid_ip(ip: str) -> bool:
    """简单的 IP 地址格式验证，防止注入攻击"""
    if not ip:
        return False
    # 检查长度限制（IPv6 最长 45 字符）
    if len(ip) > 45:
        return False
    # 只允许 IPv4/IPv6 字符: 0-9, a-f, A-F, :, .
    allowed_chars = set("0123456789abcdefABCDEF:.")
    return all(c in allowed_chars for c in ip)


async def _record_login_failure(
    redis_client: redis.Redis,
    email_key: str,
    ip_key: str,
    client_ip: str,
    email: str,
) -> int:
    now_ts = int(time.time())
    async with redis_client.pipeline() as pipe:
        pipe.incr(email_key)
        pipe.expire(email_key, LIMIT_EXPIRE_SECONDS)
        pipe.incr(ip_key)
        pipe.expire(ip_key, settings.login_fail_ip_window_seconds)
        pipe.set(
            f"{LOGIN_FAIL_IP_TS_PREFIX}{client_ip}",
            str(now_ts),
            ex=settings.login_fail_ip_window_seconds,
        )
        pipe.set(
            f"{LOGIN_FAIL_IP_EMAIL_PREFIX}{client_ip}",
            email,
            ex=settings.login_fail_ip_window_seconds,
        )
        results = await pipe.execute()
    return int(results[0]) if results else 1


def _normalize_samesite(value: str) -> str:
    return value.strip().lower()


def _cookie_secure(base_secure: bool, samesite: str) -> bool:
    if settings.is_development():
        return False
    if _normalize_samesite(samesite) == "none":
        return True
    return base_secure


def _set_auth_cookies(response: Response, token: str) -> None:
    max_age = settings.jwt_access_token_expire_minutes * 60
    csrf_token = secrets.token_urlsafe(32)
    auth_secure = _cookie_secure(settings.auth_cookie_secure, settings.auth_cookie_samesite)
    csrf_secure = _cookie_secure(settings.csrf_cookie_secure, settings.csrf_cookie_samesite)
    domain = settings.auth_cookie_domain or None

    response.set_cookie(
        settings.auth_cookie_name,
        token,
        httponly=True,
        secure=auth_secure,
        samesite=settings.auth_cookie_samesite,
        max_age=max_age,
        domain=domain,
        path=settings.auth_cookie_path,
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf_token,
        httponly=False,
        secure=csrf_secure,
        samesite=settings.csrf_cookie_samesite,
        max_age=max_age,
        domain=settings.csrf_cookie_domain or domain,
        path=settings.csrf_cookie_path,
    )


def _set_csrf_cookie(response: Response) -> None:
    max_age = settings.jwt_access_token_expire_minutes * 60
    csrf_token = secrets.token_urlsafe(32)
    csrf_secure = _cookie_secure(settings.csrf_cookie_secure, settings.csrf_cookie_samesite)
    domain = settings.csrf_cookie_domain or settings.auth_cookie_domain or None
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf_token,
        httponly=False,
        secure=csrf_secure,
        samesite=settings.csrf_cookie_samesite,
        max_age=max_age,
        domain=domain,
        path=settings.csrf_cookie_path,
    )


def _clear_auth_cookies(response: Response) -> None:
    domain = settings.auth_cookie_domain or None
    response.delete_cookie(
        settings.auth_cookie_name,
        domain=domain,
        path=settings.auth_cookie_path,
    )
    response.delete_cookie(
        settings.csrf_cookie_name,
        domain=settings.csrf_cookie_domain or domain,
        path=settings.csrf_cookie_path,
    )


class SendCodeRequest(BaseModel):
    """发送验证码请求"""
    email: EmailStr
    purpose: str = "register"  # register 或 reset
    captcha_ticket: Optional[str] = None  # 滑块验证票据（可选）


class UserRegisterWithCode(BaseModel):
    """带验证码的注册请求"""
    email: EmailStr
    password: str
    nickname: Optional[str] = None
    code: str
    captcha_ticket: Optional[str] = None
    visitor_id: Optional[str] = None  # 游客 ID，注册后转移游客对话


class ResetPasswordRequest(BaseModel):
    """重置密码请求"""
    email: EmailStr
    code: str
    new_password: str
    captcha_ticket: Optional[str] = None


async def consume_captcha_ticket(
    ticket: str,
    purpose: str,
    redis_client: redis.Redis
) -> None:
    payload = verify_captcha_ticket(ticket, settings.captcha_secret_key)
    if payload.get("typ") != "captcha_ticket" or payload.get("use") != purpose:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码票据无效",
        )

    ticket_hash = hash_captcha_ticket(ticket)
    used_key = f"{CAPTCHA_TICKET_USED_PREFIX}{ticket_hash}"
    if await redis_client.get(used_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码票据已使用",
        )

    exp = int(payload.get("exp", 0))
    ttl = max(1, exp - int(time.time()))
    await redis_client.set(used_key, "1", ex=ttl)


class ChangePasswordRequest(BaseModel):
    """修改密码请求"""
    old_password: str
    new_password: str


def validate_password_strength(password: str) -> None:
    if len(password) < settings.password_min_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"密码长度至少 {settings.password_min_length} 位",
        )

    if not re.search(r"[a-z]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码需包含小写字母",
        )

    if not re.search(r"[A-Z]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码需包含大写字母",
        )

    if not re.search(r"\d", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码需包含数字",
        )

    if re.search(r"\s", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码不能包含空格",
        )

    if not re.search(r"[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]", password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="密码需包含特殊字符 (例如: !@#$%^&*)",
        )


async def get_active_email_whitelist(db: AsyncSession) -> List[str]:
    cached = await get_cached_json(EMAIL_WHITELIST_CACHE_KEY)
    if isinstance(cached, list):
        return [str(item).lower() for item in cached]

    from app.models.email_whitelist import EmailWhitelist

    whitelist_result = await db.execute(
        select(EmailWhitelist.suffix).where(EmailWhitelist.is_active == True)
    )
    suffixes = [row[0].lower() for row in whitelist_result.all()]
    await set_cached_json(
        EMAIL_WHITELIST_CACHE_KEY,
        suffixes,
        settings.email_whitelist_cache_ttl_seconds,
    )
    return suffixes


def enforce_email_whitelist(email: str, whitelist: List[str]) -> None:
    # 临时关闭邮箱白名单限制 - 白名单为空时允许所有邮箱注册
    if not whitelist:
        return

    email_lower = email.lower()
    allowed = any(email_lower.endswith(suffix) for suffix in whitelist)
    if not allowed:
        allowed_suffixes = ", ".join(whitelist[:5])
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"该邮箱不在允许范围内，仅支持: {allowed_suffixes}",
        )


@router.post("/send-code", dependencies=[Depends(send_code_limiter)])
async def send_code(
    data: SendCodeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """发送邮箱验证码"""

    if data.purpose not in {"register", "reset"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码用途无效",
        )

    # 验证滑块验证码（如果提供了）
    if data.captcha_ticket:
        await consume_captcha_ticket(data.captcha_ticket, data.purpose, redis_client)

    client_ip = _get_client_ip(request)
    
    # 检查 IP 注册次数限制（仅注册时）
    if data.purpose == "register":
        ip_key = f"register_ip:{client_ip}"
        ip_count = await redis_client.get(ip_key)
        if ip_count and int(ip_count) >= IP_REGISTER_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"该 IP 今日注册次数已达上限 ({IP_REGISTER_LIMIT} 次)，请 24 小时后重试",
            )
    
    # 检查邮箱后缀白名单（仅注册）
    if data.purpose == "register":
        whitelist = await get_active_email_whitelist(db)
        enforce_email_whitelist(data.email, whitelist)
    
    # 注册时检查邮箱是否已存在
    if data.purpose == "register":
        result = await db.execute(select(User).where(User.email == data.email))
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该邮箱已被注册",
            )
    
    # 重置密码时检查邮箱是否存在
    if data.purpose == "reset":
        result = await db.execute(select(User).where(User.email == data.email))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该邮箱未注册",
            )
        if user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="管理员账号不支持邮件重置，请联系系统管理员",
            )

        # 检查该邮箱 24 小时内重置密码次数
        reset_count_key = f"reset_password_email:{data.email}"
        reset_count = await redis_client.get(reset_count_key)
        if reset_count and int(reset_count) >= RESET_PASSWORD_EMAIL_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"该邮箱今日重置密码次数已达上限 ({RESET_PASSWORD_EMAIL_LIMIT} 次)，请 24 小时后重试",
            )

    # 生成验证码
    now = datetime.utcnow()
    code = generate_code()
    expires_at = now + timedelta(minutes=settings.email_code_expire_minutes)

    logger.info(f"[验证码] 生成验证码成功: 邮箱={data.email}, 用途={data.purpose}, 验证码={code}, 过期时间={expires_at}")

    # 保存验证码（同时作废历史未使用验证码）
    email_code = EmailCode(
        email=data.email,
        code=code,
        purpose=data.purpose,
        expires_at=expires_at,
    )
    # 作废历史未使用验证码
    await db.execute(
        update(EmailCode)
        .where(
            EmailCode.email == data.email,
            EmailCode.purpose == data.purpose,
            EmailCode.is_used == False,
            EmailCode.expires_at > now,
        )
        .values(is_used=True)
    )
    db.add(email_code)

    logger.info(f"[验证码] 验证码已保存到数据库: 邮箱={data.email}, 用途={data.purpose}")

    # 直接发送邮件 (使用 email_service，同测试邮件)
    email_sent = send_verification_code(data.email, code, data.purpose)
    logger.info(f"[邮件] 邮件发送结果: 邮箱={data.email}, 成功={email_sent}")

    # 重置密码时增加计数
    if data.purpose == "reset":
        reset_count_key = f"reset_password_email:{data.email}"
        await redis_client.incr(reset_count_key)
        await redis_client.expire(reset_count_key, LIMIT_EXPIRE_SECONDS)

    return {"message": "验证码已发送，请查收邮箱"}


@router.post("/register", response_model=TokenResponse)
async def register(
    data: UserRegisterWithCode,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """用户注册（需验证码）"""
    client_ip = _get_client_ip(request)
    ip_key = f"register_ip:{client_ip}"
    email_key = f"register_email:{data.email}"

    # [注册] 开始注册流程
    logger.info(f"[注册] 收到注册请求: 邮箱={data.email}, 昵称={data.nickname}, IP={client_ip}")

    # 检查 IP 注册次数限制
    ip_count = await redis_client.get(ip_key)
    if ip_count and int(ip_count) >= IP_REGISTER_LIMIT:
        logger.warning(f"[注册] IP 注册次数超限: IP={client_ip}, 次数={ip_count}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"该 IP 今日注册次数已达上限 ({IP_REGISTER_LIMIT} 次)，请 24 小时后重试",
        )

    email_count = await redis_client.get(email_key)
    if email_count and int(email_count) >= EMAIL_REGISTER_LIMIT:
        logger.warning(f"[注册] 邮箱注册次数超限: 邮箱={data.email}, 次数={email_count}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"该邮箱今日注册次数已达上限 ({EMAIL_REGISTER_LIMIT} 次)，请 24 小时后重试",
        )

    # 验证滑块验证码（如果提供了）
    if data.captcha_ticket:
        logger.info(f"[注册] 验证滑块验证码: 邮箱={data.email}")
        await consume_captcha_ticket(data.captcha_ticket, "register", redis_client)
        logger.info(f"[注册] 滑块验证码验证通过: 邮箱={data.email}")

    # 验证密码强度
    logger.info(f"[注册] 验证密码强度: 邮箱={data.email}")
    validate_password_strength(data.password)
    logger.info(f"[注册] 密码强度验证通过: 邮箱={data.email}")

    # 检查邮箱白名单
    whitelist = await get_active_email_whitelist(db)
    logger.info(f"[注册] 邮箱白名单检查: 邮箱={data.email}, 白名单数量={len(whitelist)}")
    enforce_email_whitelist(data.email, whitelist)

    # 检查邮箱是否已存在
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        logger.warning(f"[注册] 邮箱已存在: 邮箱={data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册",
        )

    # 检查是否是第一个用户
    first_user_check = await db.execute(select(User).limit(1))
    is_first_user = first_user_check.scalar_one_or_none() is None
    logger.info(f"[注册] 检查是否首用户: 邮箱={data.email}, is_first_user={is_first_user}")

    # 创建用户
    user = User(
        email=data.email,
        password_hash=get_password_hash(data.password),
        nickname=data.nickname or data.email.split("@")[0],
        credit_balance=0,
        is_admin=is_first_user,  # 第一个注册的用户自动成为管理员
    )
    try:
        # 验证并消费验证码
        logger.info(f"[注册] 验证邮箱验证码: 邮箱={data.email}, 验证码={data.code[:2]}****")
        now = datetime.utcnow()
        update_result = await db.execute(
            update(EmailCode)
            .where(
                EmailCode.email == data.email,
                EmailCode.code == data.code,
                EmailCode.purpose == "register",
                EmailCode.is_used == False,
                EmailCode.expires_at > now,
            )
            .values(is_used=True)
        )
        if update_result.rowcount != 1:
            logger.warning(f"[注册] 邮箱验证码无效或已过期: 邮箱={data.email}, rowcount={update_result.rowcount}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="验证码无效或已过期",
            )
        logger.info(f"[注册] 邮箱验证码验证通过: 邮箱={data.email}")

        db.add(user)
        await db.commit()
        logger.info(f"[注册] 用户已添加到数据库: 邮箱={data.email}, 昵称={user.nickname}, is_admin={user.is_admin}")
    except IntegrityError:
        logger.warning(f"[注册] 数据库完整性错误: 邮箱={data.email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该邮箱已被注册",
        )
    await db.refresh(user)

    # 增加 IP 注册计数
    await redis_client.incr(ip_key)
    await redis_client.expire(ip_key, LIMIT_EXPIRE_SECONDS)

    # 增加邮箱注册计数
    await redis_client.incr(email_key)
    await redis_client.expire(email_key, LIMIT_EXPIRE_SECONDS)

    # 生成 Token
    logger.info(f"[注册] 生成访问令牌: 用户ID={user.id}")
    access_token = create_access_token(data={"sub": user.id})
    _set_auth_cookies(response, access_token)

    # 转移游客对话到用户账号
    if data.visitor_id:
        from app.models.conversation import Conversation
        from sqlalchemy import update as sql_update

        transfer_result = await db.execute(
            sql_update(Conversation)
            .where(
                Conversation.visitor_id == data.visitor_id,
                Conversation.user_id.is_(None)
            )
            .values(user_id=user.id)
        )
        transferred_count = transfer_result.rowcount
        if transferred_count > 0:
            logger.info(f"[注册] 转移游客对话到用户: visitor_id={data.visitor_id[:8]}..., user_id={user.id}, 数量={transferred_count}")

    logger.info(f"[注册] 注册成功: 邮箱={data.email}, 用户ID={user.id}, is_admin={user.is_admin}")

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """用户登录"""
    client_ip = _get_client_ip(request)
    email_key = f"login_fail:{data.email}"
    ip_key = f"{LOGIN_FAIL_IP_KEY_PREFIX}{client_ip}"

    # 只有提供了 captcha_ticket 才验证
    if data.captcha_ticket:
        await consume_captcha_ticket(data.captcha_ticket, "login", redis_client)
    
    # 检查登录失败次数（邮箱 + IP）
    fail_count = await redis_client.get(email_key)
    if fail_count and int(fail_count) >= LOGIN_FAIL_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录失败次数过多，账户已被临时锁定，请 24 小时后重试",
        )
    ip_fail_count = await redis_client.get(ip_key)
    if ip_fail_count and int(ip_fail_count) >= settings.login_fail_ip_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="该 IP 登录失败次数过多，请稍后再试",
        )
    
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    def _raise_login_fail(new_count: int) -> None:
        remaining = LOGIN_FAIL_LIMIT - new_count
        if remaining <= 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="登录失败次数过多，账户已被临时锁定，请 24 小时后重试",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"邮箱或密码错误，还剩 {remaining} 次尝试机会",
        )

    if not user:
        new_count = await _record_login_failure(redis_client, email_key, ip_key, client_ip, data.email)
        _raise_login_fail(int(new_count))

    if not verify_password(data.password, user.password_hash):
        new_count = await _record_login_failure(redis_client, email_key, ip_key, client_ip, data.email)
        _raise_login_fail(int(new_count))
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用",
        )
    
    # 登录成功，清除失败计数
    await redis_client.delete(email_key)
    
    access_token = create_access_token(data={"sub": user.id})
    _set_auth_cookies(response, access_token)
    
    # 记录登录信息
    user.last_login_at = datetime.utcnow()
    user.last_login_ip = client_ip
    
    login_record = LoginHistory(
        user_id=user.id,
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(login_record)

    # 转移游客对话到用户账号
    if data.visitor_id:
        from app.models.conversation import Conversation
        from sqlalchemy import update as sql_update

        transfer_result = await db.execute(
            sql_update(Conversation)
            .where(
                Conversation.visitor_id == data.visitor_id,
                Conversation.user_id.is_(None)
            )
            .values(user_id=user.id)
        )
        transferred_count = transfer_result.rowcount
        if transferred_count > 0:
            logger.info(f"[登录] 转移游客对话到用户: visitor_id={data.visitor_id[:8]}..., user_id={user.id}, 数量={transferred_count}")

    await db.commit()

    return TokenResponse(
        access_token=access_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/reset-password")
async def reset_password(
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    """通过验证码重置密码"""
    # 验证滑块验证码（如果提供了）
    if data.captcha_ticket:
        await consume_captcha_ticket(data.captcha_ticket, "reset", redis_client)

    # 验证密码强度
    validate_password_strength(data.new_password)

    # 获取用户
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )
    
    # 管理员账号需后台重置
    if user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="管理员账号请在后台重置密码",
        )

    # 更新密码并消费验证码
    try:
        now = datetime.utcnow()
        update_result = await db.execute(
            update(EmailCode)
            .where(
                EmailCode.email == data.email,
                EmailCode.code == data.code,
                EmailCode.purpose == "reset",
                EmailCode.is_used == False,
                EmailCode.expires_at > now,
            )
            .values(is_used=True)
        )
        if update_result.rowcount != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="验证码无效或已过期",
            )
        user.password_hash = get_password_hash(data.new_password)
    except HTTPException:
        raise

    return {"message": "密码重置成功，请使用新密码登录"}


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """修改密码（需登录）"""
    # 验证旧密码
    if not verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前密码错误",
        )
    
    validate_password_strength(data.new_password)
    
    # 更新密码
    current_user.password_hash = get_password_hash(data.new_password)
    await db.commit()
    
    return {"message": "密码修改成功"}


@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(optional_security),
):
    """登出并撤销当前 Token"""
    token = get_token_from_request(credentials, request)
    if token:
        await revoke_token(token)
    _clear_auth_cookies(response)
    return {"message": "已登出"}


@router.get("/me", response_model=UserResponse)
async def get_me(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
):
    """获取当前用户信息"""
    if not request.cookies.get(settings.csrf_cookie_name):
        _set_csrf_cookie(response)
    return UserResponse.model_validate(current_user)
