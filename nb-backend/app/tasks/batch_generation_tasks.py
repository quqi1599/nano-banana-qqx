"""批量图片生成 Celery 任务支持串行、并行、组合三种模式可中断、可追踪进度"""
import logging
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
import asyncio

import httpx
from celery import Task
from celery.exceptions import SoftTimeLimitExceeded

from app.celery_app import celery_app
from app.tasks.base import get_task_db, record_task_result
from app.models.batch_generation_task import BatchGenerationTask, BatchTaskStatus
from app.models.token_pool import TokenPool
from app.models.usage_log import UsageLog
from app.models.credit import CreditTransaction, TransactionType
from app.config import get_settings
from app.utils.token_security import decrypt_api_key
from app.utils.redis_client import get_redis

logger = logging.getLogger(__name__)
settings = get_settings()

# Redis key for cancellation signals
CANCEL_SIGNAL_KEY = "batch_task:cancel:{task_id}"
PROGRESS_KEY = "batch_task:progress:{task_id}"

MODEL_ALIASES = {
    "gemini-2.5-flash-image": "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image-preview": "gemini-3.1-flash-image-preview",
}

COMMON_ASPECT_RATIOS = {
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
}

MODEL_IMAGE_SIZES = {
    "gemini-3-pro-image-preview": ("1K", "2K", "4K"),
    "gemini-3.1-flash-image-preview": ("512", "1K", "2K", "4K"),
}

MODEL_ASPECT_RATIOS = {
    "gemini-3-pro-image-preview": COMMON_ASPECT_RATIOS,
    "gemini-3.1-flash-image-preview": COMMON_ASPECT_RATIOS | {"1:4", "1:8", "4:1", "8:1"},
}


def _normalize_model_name(model_name: str) -> str:
    return MODEL_ALIASES.get(model_name, model_name)


def _sanitize_image_config(model_name: str, aspect_ratio: str, resolution: str) -> tuple[str, dict]:
    normalized_model_name = _normalize_model_name(model_name)
    image_config: Dict[str, str] = {}

    allowed_sizes = MODEL_IMAGE_SIZES.get(normalized_model_name)
    if allowed_sizes:
        image_config["imageSize"] = resolution if resolution in allowed_sizes else allowed_sizes[0]

    if aspect_ratio and aspect_ratio != "Auto":
        allowed_ratios = MODEL_ASPECT_RATIOS.get(normalized_model_name, COMMON_ASPECT_RATIOS)
        if aspect_ratio in allowed_ratios:
            image_config["aspectRatio"] = aspect_ratio

    return normalized_model_name, image_config


class BatchGenerationContext:
    """批量生成任务上下文管理器"""
    def __init__(self, task_id: str, celery_task: Task = None):
        self.task_id = task_id
        self.celery_task = celery_task
        self.db = None
        self.task_record = None
        
    def __enter__(self):
        self.db = get_task_db()
        self.task_record = self.db.query(BatchGenerationTask).filter(
            BatchGenerationTask.id == self.task_id
        ).first()
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.db:
            self.db.close()
            
    def update_status(self, status: str, **kwargs):
        """更新任务状态"""
        if self.task_record:
            self.task_record.status = status
            for key, value in kwargs.items():
                if hasattr(self.task_record, key):
                    setattr(self.task_record, key, value)
            self.db.commit()
            
    def add_result(self, index: int, status: str, parts: List[Dict] = None, error: str = None, duration: float = 0):
        """添加单个任务结果"""
        if not self.task_record:
            return
            
        result_item = {
            "index": index,
            "status": status,
            "parts": parts or [],
            "error": error,
            "duration": duration,
            "completed_at": datetime.utcnow().isoformat(),
        }
        
        if not self.task_record.results:
            self.task_record.results = []
        self.task_record.results.append(result_item)
        
        if status == "success":
            self.task_record.completed_count += 1
        elif status == "failed":
            self.task_record.failed_count += 1
            
        self.db.commit()
        
    async def is_cancelled(self) -> bool:
        """检查任务是否被取消"""
        redis = await get_redis()
        cancelled = await redis.get(CANCEL_SIGNAL_KEY.format(task_id=self.task_id))
        return cancelled is not None


def _check_cancelled(task_id: str) -> bool:
    """同步检查是否被取消（用于 Celery 任务中）"""
    try:
        import redis
        r = redis.from_url(settings.redis_url)
        return r.exists(CANCEL_SIGNAL_KEY.format(task_id=task_id))
    except Exception as e:
        logger.warning(f"检查取消状态失败: {e}")
        return False


def _update_progress(task_id: str, current: int, total: int):
    """更新进度到 Redis"""
    try:
        import redis
        import json
        r = redis.from_url(settings.redis_url)
        r.setex(
            PROGRESS_KEY.format(task_id=task_id),
            3600,  # 1小时过期
            json.dumps({"current": current, "total": total, "updated_at": datetime.utcnow().isoformat()})
        )
    except Exception as e:
        logger.warning(f"更新进度失败: {e}")


async def generate_single_image(
    token: TokenPool,
    prompt: str,
    model_name: str,
    aspect_ratio: str,
    resolution: str,
    images_payload: List[Dict],
    history: List[Dict],
    use_grounding: bool = False,
) -> Dict[str, Any]:
    """生成单张图片"""
    normalized_model_name, image_config = _sanitize_image_config(model_name, aspect_ratio, resolution)
    target_url = f"{settings.newapi_base_url}/v1beta/models/{normalized_model_name}:generateContent"
    
    request_body = {
        "model": normalized_model_name,
        "contents": [*history, {
            "role": "user",
            "parts": [
                *[{"inline_data": {"mime_type": img["mime_type"], "data": img["data"]}} for img in images_payload],
                {"text": prompt}
            ]
        }],
        "config": {
            "imageConfig": image_config,
            "tools": [{"googleSearch": {}}] if use_grounding else [],
            "responseModalities": ["TEXT", "IMAGE"],
        },
    }
    
    plain_key = decrypt_api_key(token.api_key)
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": plain_key,
    }
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(target_url, json=request_body, headers=headers)
        response.raise_for_status()
        return response.json()


@celery_app.task(
    name="app.tasks.batch_generation_tasks.batch_image_generation_task",
    bind=True,
    max_retries=0,
    time_limit=1800,  # 30分钟硬超时
    soft_time_limit=1740,  # 29分钟软超时
)
def batch_image_generation_task(self, task_id: str):
    """
    批量图片生成任务
    
    Args:
        task_id: 批量任务的数据库ID
    """
    start_time = datetime.utcnow()
    
    with BatchGenerationContext(task_id, self) as ctx:
        if not ctx.task_record:
            logger.error(f"任务记录不存在: {task_id}")
            return {"status": "failed", "error": "Task record not found"}
            
        task_record = ctx.task_record
        
        # 检查是否已被取消
        if _check_cancelled(task_id):
            ctx.update_status(BatchTaskStatus.CANCELLED.value)
            return {"status": "cancelled"}
            
        # 更新状态为运行中
        ctx.update_status(
            BatchTaskStatus.RUNNING.value,
            started_at=start_time,
            celery_task_id=self.request.id
        )
        
        try:
            config = task_record.config or {}
            mode = task_record.mode
            prompts = config.get("prompts", [])
            model_name = config.get("model_name", "gemini-3-pro-image-preview")
            aspect_ratio = config.get("aspect_ratio", "Auto")
            resolution = config.get("resolution", "1K")
            use_grounding = config.get("use_grounding", False)
            initial_images = task_record.initial_images or []
            
            # 准备图片 payload
            images_payload = [
                {"mime_type": img["mime_type"], "data": img["data"]}
                for img in initial_images
            ]
            
            # 根据模式执行
            if mode == "serial":
                results = _execute_serial(ctx, prompts, model_name, aspect_ratio, resolution, images_payload, use_grounding)
            elif mode == "parallel":
                results = _execute_parallel(ctx, prompts, model_name, aspect_ratio, resolution, images_payload, use_grounding)
            elif mode == "combination":
                results = _execute_combination(ctx, prompts, model_name, aspect_ratio, resolution, images_payload, use_grounding)
            else:
                raise ValueError(f"Unknown mode: {mode}")
                
            # 计算最终状态
            success_count = sum(1 for r in results if r["status"] == "success")
            failed_count = sum(1 for r in results if r["status"] == "failed")
            
            final_status = BatchTaskStatus.COMPLETED.value if failed_count == 0 else "partial" if success_count > 0 else BatchTaskStatus.FAILED.value
            
            ctx.update_status(
                final_status,
                completed_at=datetime.utcnow(),
            )
            
            duration = (datetime.utcnow() - start_time).total_seconds()
            
            record_task_result(
                task_id=self.request.id,
                task_name="batch_image_generation",
                status="success",
                result={"task_id": task_id, "success": success_count, "failed": failed_count},
                duration=duration,
            )
            
            return {
                "status": final_status,
                "total": len(results),
                "success": success_count,
                "failed": failed_count,
                "duration": duration,
            }
            
        except SoftTimeLimitExceeded:
            logger.warning(f"任务软超时: {task_id}")
            ctx.update_status(
                BatchTaskStatus.CANCELLED.value,
                error_message="任务执行时间超过限制",
                completed_at=datetime.utcnow(),
            )
            # 触发退款逻辑
            _refund_remaining_credits(ctx)
            raise
            
        except Exception as e:
            logger.error(f"批量生成任务失败: {e}", exc_info=True)
            ctx.update_status(
                BatchTaskStatus.FAILED.value,
                error_message=str(e)[:500],
                completed_at=datetime.utcnow(),
            )
            # 触发退款逻辑
            _refund_remaining_credits(ctx)
            raise


def _execute_serial(ctx: BatchGenerationContext, prompts, model_name, aspect_ratio, resolution, images_payload, use_grounding):
    """串行执行"""
    results = []
    current_images = images_payload.copy()
    
    for idx, prompt in enumerate(prompts):
        # 检查取消
        if _check_cancelled(ctx.task_id):
            logger.info(f"任务被取消: {ctx.task_id} at step {idx}")
            ctx.update_status(BatchTaskStatus.CANCELLED.value)
            break
            
        try:
            # 获取可用 token
            from app.routers.proxy import get_available_tokens_sync
            tokens = get_available_tokens_sync(ctx.db)
            
            if not tokens:
                raise Exception("No available tokens")
                
            token = tokens[0]
            
            # 执行生成
            result = asyncio.run(generate_single_image(
                token, prompt, model_name, aspect_ratio, resolution, current_images, [], use_grounding
            ))
            
            # 提取结果
            candidate = result.get("candidates", [{}])[0]
            parts = candidate.get("content", {}).get("parts", [])
            
            # 添加结果
            ctx.add_result(idx, "success", parts=parts)
            _update_progress(ctx.task_id, idx + 1, len(prompts))
            
            # 提取生成的图片作为下一步输入
            image_parts = [p for p in parts if p.get("inlineData")]
            if image_parts:
                current_images = [{"mime_type": p["inlineData"]["mimeType"], "data": p["inlineData"]["data"]} for p in image_parts]
            else:
                current_images = images_payload.copy()  # 使用原图继续
                
            results.append({"status": "success", "parts": parts})
            
        except Exception as e:
            logger.error(f"串行步骤 {idx} 失败: {e}")
            ctx.add_result(idx, "failed", error=str(e)[:200])
            results.append({"status": "failed", "error": str(e)})
            _update_progress(ctx.task_id, idx + 1, len(prompts))
            
    return results


def _execute_parallel(ctx: BatchGenerationContext, prompts, model_name, aspect_ratio, resolution, images_payload, use_grounding):
    """并行执行"""
    import concurrent.futures
    
    results = [None] * len(prompts)
    completed = 0
    
    def run_single(idx: int, prompt: str) -> Dict:
        nonlocal completed
        
        if _check_cancelled(ctx.task_id):
            return {"status": "cancelled", "index": idx}
            
        try:
            from app.routers.proxy import get_available_tokens_sync
            tokens = get_available_tokens_sync(ctx.db)
            
            if not tokens:
                return {"status": "failed", "index": idx, "error": "No available tokens"}
                
            token = tokens[idx % len(tokens)]  # 轮询使用不同 token
            
            result = asyncio.run(generate_single_image(
                token, prompt, model_name, aspect_ratio, resolution, images_payload, [], use_grounding
            ))
            
            candidate = result.get("candidates", [{}])[0]
            parts = candidate.get("content", {}).get("parts", [])
            
            return {"status": "success", "index": idx, "parts": parts}
            
        except Exception as e:
            return {"status": "failed", "index": idx, "error": str(e)}
    
    # 使用线程池限制并发数
    max_workers = min(len(prompts), 5)  # 最多5个并发
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(run_single, i, p): i for i, p in enumerate(prompts)}
        
        for future in concurrent.futures.as_completed(futures):
            if _check_cancelled(ctx.task_id):
                executor.shutdown(wait=False)
                break
                
            result = future.result()
            idx = result["index"]
            
            if result["status"] == "success":
                ctx.add_result(idx, "success", parts=result.get("parts"))
            elif result["status"] == "failed":
                ctx.add_result(idx, "failed", error=result.get("error"))
                
            completed += 1
            _update_progress(ctx.task_id, completed, len(prompts))
            results[idx] = result
            
    return [r for r in results if r is not None]


def _execute_combination(ctx: BatchGenerationContext, prompts, model_name, aspect_ratio, resolution, images_payload, use_grounding):
    """组合执行（每张图 × 每个提示词）"""
    import concurrent.futures
    
    total_tasks = len(images_payload) * len(prompts)
    results = [None] * total_tasks
    completed = 0
    
    def run_single(img_idx: int, prompt_idx: int, image: Dict, prompt: str) -> Dict:
        if _check_cancelled(ctx.task_id):
            return {"status": "cancelled", "index": img_idx * len(prompts) + prompt_idx}
            
        try:
            from app.routers.proxy import get_available_tokens_sync
            tokens = get_available_tokens_sync(ctx.db)
            
            if not tokens:
                return {"status": "failed", "index": img_idx * len(prompts) + prompt_idx, "error": "No available tokens"}
                
            token = tokens[(img_idx + prompt_idx) % len(tokens)]
            
            single_image = [{"mime_type": image["mime_type"], "data": image["data"]}]
            
            result = asyncio.run(generate_single_image(
                token, prompt, model_name, aspect_ratio, resolution, single_image, [], use_grounding
            ))
            
            candidate = result.get("candidates", [{}])[0]
            parts = candidate.get("content", {}).get("parts", [])
            
            return {"status": "success", "index": img_idx * len(prompts) + prompt_idx, "parts": parts}
            
        except Exception as e:
            return {"status": "failed", "index": img_idx * len(prompts) + prompt_idx, "error": str(e)}
    
    # 使用线程池限制并发
    max_workers = min(total_tasks, 5)
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for img_idx, image in enumerate(images_payload):
            for prompt_idx, prompt in enumerate(prompts):
                idx = img_idx * len(prompts) + prompt_idx
                future = executor.submit(run_single, img_idx, prompt_idx, image, prompt)
                futures[future] = idx
        
        for future in concurrent.futures.as_completed(futures):
            if _check_cancelled(ctx.task_id):
                executor.shutdown(wait=False)
                break
                
            result = future.result()
            idx = result["index"]
            
            if result["status"] == "success":
                ctx.add_result(idx, "success", parts=result.get("parts"))
            elif result["status"] == "failed":
                ctx.add_result(idx, "failed", error=result.get("error"))
                
            completed += 1
            _update_progress(ctx.task_id, completed, total_tasks)
            results[idx] = result
            
    return [r for r in results if r is not None]


def _refund_remaining_credits(ctx: BatchGenerationContext):
    """退还未完成任务的次数"""
    if not ctx.task_record:
        return
        
    completed = ctx.task_record.completed_count
    total = ctx.task_record.total_count
    credits_per_task = ctx.task_record.total_credits // max(total, 1)
    
    remaining = total - completed
    if remaining > 0:
        refund_amount = remaining * credits_per_task
        ctx.task_record.refunded_credits = refund_amount
        ctx.db.commit()
        
        # TODO: 实际执行退款到用户账户
        logger.info(f"任务 {ctx.task_id} 退款 {refund_amount} 次")


@celery_app.task(name="app.tasks.batch_generation_tasks.cancel_batch_task")
def cancel_batch_task(task_id: str, cancelled_by: str = "user", reason: str = ""):
    """
    取消批量生成任务
    
    1. 设置 Redis 取消信号
    2. 更新数据库状态
    3. 如果任务还在队列中，撤销它
    """
    try:
        # 1. 设置 Redis 取消信号
        import redis
        r = redis.from_url(settings.redis_url)
        r.setex(CANCEL_SIGNAL_KEY.format(task_id=task_id), 3600, "1")
        
        # 2. 更新数据库
        with BatchGenerationContext(task_id) as ctx:
            if ctx.task_record and ctx.task_record.can_cancel():
                ctx.update_status(
                    BatchTaskStatus.CANCELLED.value,
                    cancelled_at=datetime.utcnow(),
                    cancelled_by=cancelled_by,
                    cancel_reason=reason,
                )
                
                # 3. 尝试撤销 Celery 任务
                if ctx.task_record.celery_task_id:
                    celery_app.control.revoke(
                        ctx.task_record.celery_task_id,
                        terminate=True,
                        signal='SIGTERM'
                    )
                    
                # 4. 触发退款
                _refund_remaining_credits(ctx)
                
        return {"status": "success", "task_id": task_id}
        
    except Exception as e:
        logger.error(f"取消任务失败: {e}")
        return {"status": "failed", "error": str(e)}


@celery_app.task(name="app.tasks.batch_generation_tasks.cleanup_stale_batch_tasks")
def cleanup_stale_batch_tasks():
    """清理过期的批量任务（运行超过 1 小时的任务）"""
    with get_task_db() as db:
        stale_time = datetime.utcnow() - __import__('datetime').timedelta(hours=1)
        
        stale_tasks = db.query(BatchGenerationTask).filter(
            BatchGenerationTask.status.in_([BatchTaskStatus.RUNNING.value, BatchTaskStatus.QUEUED.value]),
            BatchGenerationTask.started_at < stale_time
        ).all()
        
        for task in stale_tasks:
            task.status = BatchTaskStatus.FAILED.value
            task.error_message = "任务执行超时（超过1小时）"
            task.completed_at = datetime.utcnow()
            
        db.commit()
        
        return {"cleaned": len(stale_tasks)}
