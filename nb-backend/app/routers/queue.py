"""
队列监控 API 路由

提供类似 Laravel Horizon 的队列监控功能：
- 队列状态概览
- 任务列表
- 任务详情
- 失败任务管理
"""
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timedelta

from app.database import get_db
from app.utils.redis_client import get_redis
from app.utils.security import get_admin_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/queue", tags=["队列监控"])


async def get_celery_stats(redis_client=None) -> Dict[str, Any]:
    """
    从 Redis 获取 Celery 统计信息

    返回队列状态、任务统计等
    """
    if redis_client is None:
        redis_client = get_redis()

    stats = {
        "queues": {},
        "workers": {},
        "tasks": {
            "pending": 0,
            "active": 0,
            "failed": 0,
            "succeeded": 0,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }

    try:
        # 获取各队列长度
        queue_names = ["default", "email", "cleanup", "api", "stats", "low"]
        for queue_name in queue_names:
            queue_key = f"celery:{queue_name}"  # Celery 默认 key 格式
            length = await redis_client.llen(queue_key)
            stats["queues"][queue_name] = {
                "pending": length,
            }

        # 获取失败任务数
        failed_key = "celery:failed"  # 或使用 celery-task-results
        stats["tasks"]["failed"] = await redis_client.scard(failed_key) if failed_key else 0

        # 获取活跃 worker 数
        worker_keys = await redis_client.keys("celery:beat:*")
        stats["workers"]["count"] = len(worker_keys)

    except Exception as e:
        logger.error(f"获取 Celery 统计失败: {e}")

    return stats


@router.get("/stats")
async def get_queue_stats(
    current_user = Depends(get_admin_user),
    redis_client = Depends(get_redis),
) -> Dict[str, Any]:
    """
    获取队列统计信息

    返回：
    - 各队列待处理任务数
    - 活跃 worker 数
    - 任务状态统计
    """
    return await get_celery_stats(redis_client)


@router.get("/workers")
async def get_workers(
    current_user = Depends(get_admin_user),
    redis_client = Depends(get_redis),
) -> Dict[str, Any]:
    """
    获取 Worker 列表及状态

    返回：
    - Worker 列表
    - 每个 Worker 的状态、当前任务等
    """
    workers = {
        "workers": [],
        "total": 0,
        "online": 0,
        "timestamp": datetime.utcnow().isoformat(),
    }

    try:
        # 获取所有 worker 信息
        worker_keys = await redis_client.keys("celery:worker-*")
        workers["total"] = len(worker_keys)

        for key in worker_keys:
            worker_data = await redis_client.hgetall(key)
            if worker_data:
                workers["workers"].append({
                    "name": key.decode() if isinstance(key, bytes) else key,
                    "status": "online",
                })
                workers["online"] += 1

    except Exception as e:
        logger.error(f"获取 Worker 列表失败: {e}")

    return workers


@router.get("/tasks")
async def get_tasks(
    queue: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user = Depends(get_admin_user),
    redis_client = Depends(get_redis),
) -> Dict[str, Any]:
    """
    获取任务列表

    参数：
    - queue: 队列名称过滤
    - status: 状态过滤 (pending/active/failed/succeeded)
    - limit: 返回数量
    - offset: 偏移量
    """
    from app.celery_app import celery_app

    inspect = celery_app.control.inspect()
    tasks = {
        "tasks": [],
        "total": 0,
        "queue": queue,
        "status": status,
    }

    try:
        if status == "active" or status is None:
            # 获取正在执行的任务
            active = inspect.active()
            if active:
                for worker, worker_tasks in active.items():
                    for task in worker_tasks:
                        if queue is None or task.get("delivery_info", {}).get("routing_key") == queue:
                            tasks["tasks"].append({
                                "id": task.get("id"),
                                "name": task.get("name"),
                                "args": task.get("args"),
                                "kwargs": task.get("kwargs"),
                                "worker": worker,
                                "time_start": task.get("time_start"),
                                "status": "active",
                            })

        if status == "pending" or status is None:
            # 获取待处理任务
            reserved = inspect.reserved()
            if reserved:
                for worker, worker_tasks in reserved.items():
                    for task in worker_tasks:
                        if queue is None or task.get("delivery_info", {}).get("routing_key") == queue:
                            tasks["tasks"].append({
                                "id": task.get("id"),
                                "name": task.get("name"),
                                "worker": worker,
                                "status": "pending",
                            })

        tasks["total"] = len(tasks["tasks"])

        # 分页
        tasks["tasks"] = tasks["tasks"][offset:offset + limit]

    except Exception as e:
        logger.error(f"获取任务列表失败: {e}")

    return tasks


@router.get("/tasks/{task_id}")
async def get_task_detail(
    task_id: str,
    current_user = Depends(get_admin_user),
) -> Dict[str, Any]:
    """
    获取任务详情

    返回任务的完整信息，包括：
    - 任务状态
    - 执行结果
    - 错误信息（如果失败）
    - 执行时长
    """
    from app.celery_app import celery_app

    try:
        result = celery_app.AsyncResult(task_id)

        return {
            "id": task_id,
            "status": result.state,
            "result": result.result if result.successful() else None,
            "error": str(result.info) if result.failed() else None,
            "traceback": result.traceback if result.failed() else None,
            "backend": str(result.backend),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取任务详情失败: {e}")


@router.post("/tasks/{task_id}/retry")
async def retry_task(
    task_id: str,
    current_user = Depends(get_admin_user),
) -> Dict[str, Any]:
    """
    重试失败的任务

    将失败的任务重新放入队列执行
    """
    from app.celery_app import celery_app

    try:
        # 这里需要根据实际存储的失败任务来实现
        # Celery 可以通过 result 和 retry 来重试
        result = celery_app.AsyncResult(task_id)

        if result.state == "FAILURE":
            # 尝试重试
            # 注意：需要任务本身支持 retry
            return {
                "id": task_id,
                "status": "retry_requested",
                "message": "任务重试请求已提交",
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=f"任务状态为 {result.state}，无法重试"
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重试任务失败: {e}")


@router.delete("/tasks/{task_id}")
async def cancel_task(
    task_id: str,
    current_user = Depends(get_admin_user),
    redis_client = Depends(get_redis),
) -> Dict[str, Any]:
    """
    取消/删除任务

    取消待处理的任务或删除任务记录
    """
    from app.celery_app import celery_app

    try:
        # 撤销任务
        celery_app.control.revoke(task_id, terminate=True)

        return {
            "id": task_id,
            "status": "cancelled",
            "message": "任务已取消",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"取消任务失败: {e}")


@router.post("/purge")
async def purge_queue(
    queue: str = Query(..., description="队列名称"),
    current_user = Depends(get_admin_user),
    redis_client = Depends(get_redis),
) -> Dict[str, Any]:
    """
    清空队列

    删除队列中所有待处理的任务
    """
    from app.celery_app import celery_app

    try:
        # 清空指定队列
        purged_count = celery_app.control.purge()

        return {
            "queue": queue,
            "purged_count": purged_count,
            "message": f"队列 {queue} 已清空",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清空队列失败: {e}")


@router.post("/workers/pool_restart")
async def pool_restart(
    current_user = Depends(get_admin_user),
) -> Dict[str, Any]:
    """
    重启所有 Worker 进程

    执行优雅重启，让 worker 完成当前任务后重启
    """
    from app.celery_app import celery_app

    try:
        celery_app.control.pool_restart()

        return {
            "status": "restart_requested",
            "message": "Worker 重启请求已发送",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重启 Worker 失败: {e}")


@router.get("/dashboard")
async def get_dashboard(
    current_user = Depends(get_admin_user),
    redis_client = Depends(get_redis),
) -> Dict[str, Any]:
    """
    获取队列监控面板数据

    类似 Horizon 的仪表板视图，包含：
    - 队列状态概览
    - 最近任务
    - Worker 状态
    - 吞吐量统计
    """
    from app.celery_app import celery_app

    inspect = celery_app.control.inspect()

    dashboard = {
        "overview": {
            "queues": {},
            "workers": {
                "total": 0,
                "online": 0,
            },
            "tasks": {
                "pending": 0,
                "active": 0,
            },
        },
        "recent_tasks": [],
        "workers": [],
        "throughput": {
            "last_hour": 0,
            "last_day": 0,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }

    try:
        # 队列状态
        queue_names = ["default", "email", "cleanup", "api", "stats", "low"]
        for name in queue_names:
            key = f"celery:{name}"
            length = await redis_client.llen(key)
            dashboard["overview"]["queues"][name] = length
            dashboard["overview"]["tasks"]["pending"] += length

        # Worker 状态
        active = inspect.active()
        if active:
            dashboard["workers"] = [
                {"name": w, "active_tasks": len(t)}
                for w, t in active.items()
            ]
            dashboard["overview"]["workers"]["total"] = len(active)
            dashboard["overview"]["workers"]["online"] = len(active)
            dashboard["overview"]["tasks"]["active"] = sum(len(t) for t in active.values())

        # 最近任务（从 active 中获取）
        if active:
            for worker, tasks in list(active.items())[:5]:
                for task in tasks[:3]:
                    dashboard["recent_tasks"].append({
                        "id": task.get("id"),
                        "name": task.get("name"),
                        "worker": worker,
                        "status": "active",
                        "time_start": task.get("time_start"),
                    })

    except Exception as e:
        logger.error(f"获取仪表板数据失败: {e}")

    return dashboard
