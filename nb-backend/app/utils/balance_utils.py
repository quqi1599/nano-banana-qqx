"""
余额查询工具函数
支持 OpenAI Dashboard API 和 New API 两种方式
"""
import httpx
from datetime import datetime, timedelta
from typing import Optional

# 默认的 API 基础地址
DEFAULT_API_BASE = "https://generativelanguage.googleapis.com"


async def check_openai_quota(api_key: str, base_url: str = DEFAULT_API_BASE) -> Optional[float]:
    """
    使用 OpenAI 兼容的 Dashboard API 查询余额
    返回剩余额度（美元），失败返回 None
    """
    headers = {"Authorization": f"Bearer {api_key}"}
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            # 1. 查询订阅信息（总额度）
            sub_res = await client.get(
                f"{base_url}/v1/dashboard/billing/subscription",
                headers=headers
            )
            if sub_res.status_code != 200:
                return None
            
            sub_data = sub_res.json()
            hard_limit_usd = sub_data.get("hard_limit_usd", 0)
            
            # 无限额度
            if hard_limit_usd >= 100000000:
                return float("inf")
            
            # 2. 查询使用情况
            now = datetime.utcnow()
            start_date = now - timedelta(days=99)
            end_date = now + timedelta(days=1)
            
            usage_res = await client.get(
                f"{base_url}/v1/dashboard/billing/usage",
                params={
                    "start_date": start_date.strftime("%Y-%m-%d"),
                    "end_date": end_date.strftime("%Y-%m-%d"),
                },
                headers=headers
            )
            if usage_res.status_code != 200:
                return None
            
            usage_data = usage_res.json()
            total_usage = usage_data.get("total_usage", 0) / 100  # 转换为美元
            
            return hard_limit_usd - total_usage
            
        except Exception:
            return None


async def check_new_api_quota(api_key: str, base_url: str = DEFAULT_API_BASE) -> Optional[float]:
    """
    使用 New API 平台的 /api/user/self 接口查询余额
    返回剩余额度（美元），失败返回 None
    """
    headers = {"Authorization": f"Bearer {api_key}"}
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            res = await client.get(
                f"{base_url}/api/user/self",
                headers=headers
            )
            if res.status_code != 200:
                return None
            
            data = res.json()
            if not data.get("success") or not data.get("data"):
                return None
            
            # New API 的额度单位是"分"，需要转换为美元（÷ 500000）
            quota = data["data"].get("quota", 0)
            used_quota = data["data"].get("used_quota", 0)
            
            quota_in_usd = quota / 500000
            used_in_usd = used_quota / 500000
            
            if quota_in_usd >= 100000000:
                return float("inf")
            
            return quota_in_usd - used_in_usd
            
        except Exception:
            return None


async def check_api_key_quota(api_key: str, base_url: Optional[str] = None) -> Optional[float]:
    """
    查询 API Key 的剩余额度
    自动检测 API 类型：先尝试 OpenAI 兼容方式，失败后切换到 New API 方式
    
    Args:
        api_key: API Key
        base_url: API 基础地址，默认使用 Google Generative AI
        
    Returns:
        剩余额度（美元），失败返回 None
    """
    url = base_url or DEFAULT_API_BASE
    
    # 1. 先尝试 OpenAI 兼容的 Dashboard API
    result = await check_openai_quota(api_key, url)
    if result is not None:
        return result
    
    # 2. 降级到 New API
    result = await check_new_api_quota(api_key, url)
    if result is not None:
        return result
    
    return None
