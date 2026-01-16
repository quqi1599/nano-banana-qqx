"""
Token 池管理路由
"""
import logging
from datetime import datetime
from typing import Optional
import asyncio

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.token_pool import TokenPool
from app.schemas.admin import (
    TokenPoolCreate,
    TokenPoolResponse,
    TokenPoolUpdate,
)
from app.utils.security import get_admin_user
from app.utils.balance_utils import check_api_key_quota
from app.utils.token_security import (
    build_key_parts,
    decrypt_api_key,
    encrypt_api_key,
    hash_api_key,
    mask_key_parts,
)
from app.utils.cache import get_cached_json, set_cached_json, delete_cache
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()

TOKEN_POOL_CACHE_KEY = "token_pool:list:v1"
TOKEN_POOL_CACHE_TTL_SECONDS = 60


def token_response(token: TokenPool) -> TokenPoolResponse:
    """
    构建Token响应对象，隐藏敏感信息

    Args:
        token: Token池记录

    Returns:
        TokenPoolResponse: 包含脱敏后的API Key的响应
    """
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


@router.get("/tokens", response_model=list[TokenPoolResponse])
async def list_tokens(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取所有 Token

    Returns:
        Token列表，按优先级降序排列
    """
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
    """
    添加新 Token

    Args:
        data: Token创建请求，包含API Key、名称、优先级等

    Returns:
        创建的Token信息

    Raises:
        HTTPException: Token已存在时
    """
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
    base_url: Optional[str] = Query(default=None, description="自定义API端点"),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    检查 Token 额度

    Args:
        token_id: Token ID
        base_url: 可选的自定义API端点

    Returns:
        更新后的Token信息

    Raises:
        HTTPException: Token不存在或查询失败时
    """
    result = await db.execute(select(TokenPool).where(TokenPool.id == token_id))
    token = result.scalar_one_or_none()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token 不存在",
        )

    # 查询额度（使用完整的 API Key）
    try:
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
    """
    更新 Token

    Args:
        token_id: Token ID
        data: 更新数据

    Returns:
        更新后的Token信息

    Raises:
        HTTPException: Token不存在时
    """
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
    """
    删除 Token

    Args:
        token_id: Token ID

    Returns:
        删除成功消息

    Raises:
        HTTPException: Token不存在时
    """
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


# ============================================================================
# 批量刷新 Token 额度
# ============================================================================
async def refresh_single_token_quota(
    token: TokenPool,
    db: AsyncSession,
) -> dict:
    """
    刷新单个 Token 的额度

    Args:
        token: Token 对象
        db: 数据库会话

    Returns:
        刷新结果字典
    """
    try:
        plain_key = decrypt_api_key(token.api_key)
        token_base_url = token.base_url.strip() if token.base_url else None
        quota = await check_api_key_quota(
            plain_key, token_base_url or settings.newapi_base_url
        )
        if quota is not None:
            token.remaining_quota = quota
            token.last_checked_at = datetime.utcnow()
            await db.commit()
            await db.refresh(token)
            logger.info(f"Token {token.name} 额度刷新成功: {quota}")
            return {
                "token_id": token.id,
                "token_name": token.name,
                "success": True,
                "remaining_quota": quota,
            }
        else:
            return {
                "token_id": token.id,
                "token_name": token.name,
                "success": False,
                "error": "无法获取额度信息",
            }
    except Exception as e:
        logger.error(f"Token {token.name} 额度刷新失败: {e}")
        return {
            "token_id": token.id,
            "token_name": token.name,
            "success": False,
            "error": str(e),
        }


@router.post("/tokens/refresh-all-quota")
async def refresh_all_tokens_quota(
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    一键刷新所有 Token 的额度

    并发查询所有启用状态的 Token 额度，并更新到数据库。

    Returns:
        刷新结果汇总，包含成功数量、失败数量和详细信息

    响应示例:
        {
            "success_count": 5,
            "failure_count": 1,
            "total_count": 6,
            "results": [...]
        }
    """
    # 获取所有启用状态的 Token
    result = await db.execute(
        select(TokenPool).where(TokenPool.is_active == True).order_by(TokenPool.priority.desc())
    )
    tokens = result.scalars().all()

    if not tokens:
        return {
            "success_count": 0,
            "failure_count": 0,
            "total_count": 0,
            "results": [],
            "message": "没有可刷新的 Token"
        }

    # 并发刷新所有 Token 额度（限制并发数为 5，避免过载）
    semaphore = asyncio.Semaphore(5)

    async def refresh_with_semaphore(token: TokenPool):
        async with semaphore:
            return await refresh_single_token_quota(token, db)

    results = await asyncio.gather(
        *[refresh_with_semaphore(token) for token in tokens],
        return_exceptions=True
    )

    # 处理异常结果
    processed_results = []
    for r in results:
        if isinstance(r, Exception):
            processed_results.append({
                "token_id": "unknown",
                "token_name": "unknown",
                "success": False,
                "error": str(r)
            })
        else:
            processed_results.append(r)

    # 统计结果
    success_count = sum(1 for r in processed_results if r.get("success"))
    failure_count = len(processed_results) - success_count

    # 清除缓存
    await delete_cache(TOKEN_POOL_CACHE_KEY)

    logger.info(
        f"Admin {admin.email} 批量刷新 Token 额度完成: "
        f"成功 {success_count}, 失败 {failure_count}, 总计 {len(tokens)}"
    )

    return {
        "success_count": success_count,
        "failure_count": failure_count,
        "total_count": len(tokens),
        "results": processed_results,
        "message": f"刷新完成：成功 {success_count} 个，失败 {failure_count} 个"
    }
