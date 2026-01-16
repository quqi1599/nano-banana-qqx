"""
API 代理任务

支持：
- 异步调用第三方 API
- API 请求重试
- 批量 API 调用
"""
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from httpx import AsyncClient

from app.celery_app import celery_app
from app.tasks.base import record_task_result

logger = logging.getLogger(__name__)


def _run_async(coro):
    """
    在同步上下文中运行异步函数

    使用 asgiref.sync.async_to_sync 避免事件循环冲突
    比 asyncio.run() 更安全，适用于 Celery worker 环境
    """
    from asgiref.sync import async_to_sync
    return async_to_sync(coro)


@celery_app.task(
    name="app.tasks.api_tasks.proxy_api_task",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def proxy_api_task(
    self,
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    json_data: Optional[Dict[str, Any]] = None,
    timeout: int = 30,
) -> Dict[str, Any]:
    """
    异步代理 API 请求

    Args:
        url: 请求 URL
        method: HTTP 方法
        headers: 请求头
        json_data: JSON 请求体
        timeout: 超时时间（秒）

    Returns:
        API 响应结果
    """
    task_id = self.request.id
    start_time = datetime.now()

    logger.info(f"[{task_id}] 开始代理 API 请求: {method} {url}")

    async def make_request():
        async with AsyncClient(timeout=timeout) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers or {},
                json=json_data,
            )
            return {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "content": response.text[:10000],  # 限制响应大小
            }

    try:
        result = _run_async(make_request())
        duration = (datetime.now() - start_time).total_seconds()

        return record_task_result(
            task_id=task_id,
            task_name="proxy_api",
            status="success",
            result=result,
            duration=duration,
        )

    except Exception as e:
        logger.error(f"[{task_id}] API 请求失败: {e}")
        duration = (datetime.now() - start_time).total_seconds()

        record_task_result(
            task_id=task_id,
            task_name="proxy_api",
            status="failed",
            error=str(e),
            duration=duration,
        )

        # 如果是超时或 5xx 错误，重试
        if "timeout" in str(e).lower() or "50" in str(e):
            raise self.retry(exc=e)

        raise


@celery_app.task(
    name="app.tasks.api_tasks.fetch_prompts_task",
    bind=True,
    max_retries=2,
)
def fetch_prompts_task(self) -> Dict[str, Any]:
    """
    异步获取提示词库

    Returns:
        提示词数据
    """
    task_id = self.request.id
    start_time = datetime.now()

    logger.info(f"[{task_id}] 开始获取提示词库")

    async def fetch():
        async with AsyncClient() as client:
            response = await client.get(
                "https://raw.githubusercontent.com/glidea/banana-prompt-quicker/main/prompts.json"
            )
            if response.status_code == 200:
                return response.json()
            return {"categories": []}

    try:
        result = _run_async(fetch())
        duration = (datetime.now() - start_time).total_seconds()

        return record_task_result(
            task_id=task_id,
            task_name="fetch_prompts",
            status="success",
            result=result,
            duration=duration,
        )

    except Exception as e:
        logger.error(f"[{task_id}] 获取提示词失败: {e}")
        duration = (datetime.now() - start_time).total_seconds()

        record_task_result(
            task_id=task_id,
            task_name="fetch_prompts",
            status="failed",
            error=str(e),
            duration=duration,
        )
        raise self.retry(exc=e)


@celery_app.task(
    name="app.tasks.api_tasks.batch_api_call_task",
    bind=True,
)
def batch_api_call_task(
    self,
    requests: list[Dict[str, Any]],
    concurrent: int = 5,
) -> Dict[str, Any]:
    """
    批量 API 调用

    Args:
        requests: 请求列表
        concurrent: 并发数

    Returns:
        批量调用结果
    """
    task_id = self.request.id
    start_time = datetime.now()

    logger.info(f"[{task_id}] 开始批量 API 调用: {len(requests)} 个请求")

    async def fetch_all():
        import asyncio
        semaphore = asyncio.Semaphore(concurrent)

        async def fetch_one(req):
            async with semaphore:
                async with AsyncClient(timeout=req.get("timeout", 30)) as client:
                    response = await client.request(
                        method=req.get("method", "GET"),
                        url=req["url"],
                        headers=req.get("headers"),
                        json=req.get("json_data"),
                    )
                    return {
                        "url": req["url"],
                        "status_code": response.status_code,
                        "success": 200 <= response.status_code < 300,
                    }

        tasks = [fetch_one(req) for req in requests]
        return await asyncio.gather(*tasks, return_exceptions=True)

    try:
        results = _run_async(fetch_all())

        success_count = sum(1 for r in results if isinstance(r, dict) and r.get("success"))
        failed_count = len(results) - success_count

        duration = (datetime.now() - start_time).total_seconds()

        return record_task_result(
            task_id=task_id,
            task_name="batch_api_call",
            status="success",
            result={
                "total": len(requests),
                "success": success_count,
                "failed": failed_count,
                "results": results,
            },
            duration=duration,
        )

    except Exception as e:
        logger.error(f"[{task_id}] 批量 API 调用失败: {e}")
        duration = (datetime.now() - start_time).total_seconds()

        record_task_result(
            task_id=task_id,
            task_name="batch_api_call",
            status="failed",
            error=str(e),
            duration=duration,
        )
        raise
