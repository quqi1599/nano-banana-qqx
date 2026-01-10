"""
管理后台路由
"""
import uuid
from datetime import datetime, timedelta
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
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
)
from app.schemas.redeem import GenerateCodesRequest, GenerateCodesResponse, RedeemCodeInfo
from app.utils.security import get_admin_user
from app.utils.balance_utils import check_api_key_quota

logger = logging.getLogger(__name__)

router = APIRouter()


# ============ Token 池管理 ============

@router.get("/tokens", response_model=list[TokenPoolResponse])
async def list_tokens(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取所有 Token"""
    result = await db.execute(
        select(TokenPool).order_by(TokenPool.priority.desc())
    )
    tokens = result.scalars().all()
    
    # 隐藏部分 API Key
    response = []
    for token in tokens:
        token_dict = TokenPoolResponse.model_validate(token).model_dump()
        # 只显示前8位和后4位
        api_key = token.api_key
        if len(api_key) > 12:
            token_dict["api_key"] = f"{api_key[:8]}...{api_key[-4:]}"
        response.append(TokenPoolResponse(**token_dict))
    
    return response


@router.post("/tokens", response_model=TokenPoolResponse)
async def add_token(
    data: TokenPoolCreate,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """添加新 Token"""
    # 检查是否已存在
    result = await db.execute(
        select(TokenPool).where(TokenPool.api_key == data.api_key)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该 Token 已存在",
        )
    
    # 创建 Token
    token = TokenPool(
        name=data.name,
        api_key=data.api_key,
        priority=data.priority,
        base_url=data.base_url.strip() if data.base_url else None,
    )
    
    # 尝试查询额度
    try:
        settings = get_settings()
        base_url = data.base_url.strip() if data.base_url else None
        quota = await check_api_key_quota(data.api_key, base_url or settings.newapi_base_url)
        if quota is not None:
            token.remaining_quota = quota
            token.last_checked_at = datetime.utcnow()
            logger.info(f"Token {data.name} 额度查询成功: {quota}")
    except Exception as e:
        logger.warning(f"Token {data.name} 额度查询失败: {e}")
    
    db.add(token)
    await db.commit()
    await db.refresh(token)
    
    return TokenPoolResponse.model_validate(token)


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
        quota = await check_api_key_quota(
            token.api_key,
            resolved_base_url or token_base_url or settings.newapi_base_url,
        )
        if quota is not None:
            token.remaining_quota = quota
            token.last_checked_at = datetime.utcnow()
            await db.commit()
            await db.refresh(token)
            logger.info(f"Token {token.name} 额度更新为: {quota}")
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无法获取额度信息，请检查 API Key 是否有效",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token {token.name} 额度查询失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"额度查询失败: {str(e)}",
        )
    
    # 返回时隐藏部分 API Key
    token_dict = TokenPoolResponse.model_validate(token).model_dump()
    api_key = token.api_key
    if len(api_key) > 12:
        token_dict["api_key"] = f"{api_key[:8]}...{api_key[-4:]}"
    return TokenPoolResponse(**token_dict)


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
    
    return TokenPoolResponse.model_validate(token)


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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户列表"""
    # 构建查询
    query = select(User)
    
    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) |
            (User.nickname.ilike(f"%{search}%"))
        )
    
    # 获取总数
    count_query = select(func.count(User.id))
    if search:
        count_query = count_query.where(
            (User.email.ilike(f"%{search}%")) |
            (User.nickname.ilike(f"%{search}%"))
        )
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0
    
    # 分页
    query = query.order_by(User.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    users = result.scalars().all()
    
    # 获取每个用户的使用次数
    user_responses = []
    for user in users:
        usage_result = await db.execute(
            select(func.count(UsageLog.id)).where(UsageLog.user_id == user.id)
        )
        total_usage = usage_result.scalar() or 0
        
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


@router.get("/conversations", response_model=list[AdminConversationResponse])
async def list_conversations(
    user_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """获取所有用户的对话列表"""
    # 构建查询
    query = select(Conversation)

    if user_id:
        query = query.where(Conversation.user_id == user_id)

    if search:
        # 按用户邮箱搜索
        query = query.join(User).where(User.email.ilike(f"%{search}%"))

    # 分页
    query = query.order_by(Conversation.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    conversations = result.scalars().all()

    # 获取用户信息
    response = []
    for conv in conversations:
        # 获取对话所属用户
        user_result = await db.execute(select(User).where(User.id == conv.user_id))
        user = user_result.scalar_one_or_none()

        conv_dict = AdminConversationResponse.model_validate(conv).model_dump()
        conv_dict["user_email"] = user.email if user else "未知用户"
        conv_dict["user_nickname"] = user.nickname if user else None
        response.append(AdminConversationResponse(**conv_dict))

    return response


@router.get("/conversations/{conversation_id}", response_model=AdminConversationDetailResponse)
async def get_conversation_detail(
    conversation_id: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """管理员查看对话详情"""
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="对话不存在",
        )

    # 获取用户信息
    user_result = await db.execute(select(User).where(User.id == conversation.user_id))
    user = user_result.scalar_one_or_none()

    conv_dict = AdminConversationDetailResponse.model_validate(conversation).model_dump()
    conv_dict["user_email"] = user.email if user else "未知用户"
    conv_dict["user_nickname"] = user.nickname if user else None
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
