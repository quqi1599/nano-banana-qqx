"""批量生成 API 路由提供提交、查询、取消批量生成任务的接口"""
import logging
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.database import get_db
from app.models.user import User
from app.models.batch_generation_task import BatchGenerationTask, BatchTaskStatus
from app.models.model_pricing import ModelPricing
from app.utils.security import get_current_user
from app.services.credit_service import CreditService, CreditOperationError
from app.celery_app import celery_app
from app.config import get_settings
from app.utils.redis_client import get_redis

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(tags=["号案"])


# ============ 请求/响应模型 ============

class BatchGenerationRequest(BaseModel):
    mode: str = Field(..., description="生成模式: serial/parallel/combination")
    prompts: List[str] = Field(..., min_items=1, max_items=50, description="提示词列表")
    model_name: str = Field(default="gemini-3-pro-image-preview", description="模型名称")
    aspect_ratio: str = Field(default="Auto", description="宽高比")
    resolution: str = Field(default="1024x1024", description="分辨率")
    use_grounding: bool = Field(default=False, description="是否使用联网搜索")
    initial_images: List[dict] = Field(default=[], description="初始图片列表 [{mime_type, data, name}]")


class BatchTaskResponse(BaseModel):
    id: str
    mode: str
    status: str
    progress: dict
    config: dict
    results: List[dict]
    created_at: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    cancelled_at: Optional[str]
    credits: dict
    error: Optional[str]


class BatchTaskListResponse(BaseModel):
    tasks: List[BatchTaskResponse]
    total: int
    page: int
    page_size: int


class CancelBatchRequest(BaseModel):
    reason: str = Field(default="用户取消", description="取消原因")


# ============ 辅助函数 ============

async def get_credits_for_model(db: AsyncSession, model_name: str) -> int:
    """获取模型消耗次数"""
    result = await db.execute(
        select(ModelPricing).where(ModelPricing.model_name == model_name)
    )
    pricing = result.scalar_one_or_none()
    if pricing:
        return pricing.credits_per_request
    
    model_lower = model_name.lower()
    if "flash" in model_lower or "2.5" in model_lower:
        return settings.credits_gemini_25_flash
    return settings.credits_gemini_3_pro


def calculate_total_count(mode: str, prompts: List[str], images: List[dict]) -> int:
    """计算总任务数"""
    if mode == "serial":
        return len(prompts)
    elif mode == "parallel":
        return len(prompts)
    elif mode == "combination":
        return len(images) * len(prompts) if images else len(prompts)
    return len(prompts)


# ============ API 端点 ============

@router.post("/submit", response_model=BatchTaskResponse)
async def submit_batch_generation(
    request: BatchGenerationRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    提交批量生成任务
    
    1. 检查用户次数余额
    2. 创建任务记录
    3. 预扣次数
    4. 提交到 Celery
    """
    # 计算总任务数和所需次数
    total_count = calculate_total_count(request.mode, request.prompts, request.initial_images)
    credits_per_task = await get_credits_for_model(db, request.model_name)
    total_credits = total_count * credits_per_task
    
    # 检查次数余额
    credit_service = CreditService(db)
    balance = await credit_service.get_balance(current_user.id)
    
    if balance.remaining < total_credits:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"次数不足。需要 {total_credits} 次，剩余 {balance.remaining} 次"
        )
    
    # 创建任务记录
    task_id = str(uuid.uuid4())
    task_record = BatchGenerationTask(
        id=task_id,
        user_id=current_user.id,
        mode=request.mode,
        total_count=total_count,
        completed_count=0,
        failed_count=0,
        status=BatchTaskStatus.PENDING.value,
        config={
            "prompts": request.prompts,
            "model_name": request.model_name,
            "aspect_ratio": request.aspect_ratio,
            "resolution": request.resolution,
            "use_grounding": request.use_grounding,
        },
        initial_images=request.initial_images,
        total_credits=total_credits,
        estimated_duration=total_count * 30,  # 预估每个任务30秒
    )
    
    db.add(task_record)
    await db.commit()
    
    # 预扣次数
    try:
        await credit_service.deduct_credits(
            user_id=current_user.id,
            amount=total_credits,
            description=f"批量生成任务预扣: {task_id[:8]}...",
            transaction_type=TransactionType.API_CALL,
        )
    except CreditOperationError as e:
        await db.delete(task_record)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=str(e)
        )
    
    # 提交到 Celery
    try:
        celery_task = celery_app.send_task(
            "app.tasks.batch_generation_tasks.batch_image_generation_task",
            args=[task_id],
            queue="batch",  # 使用专门的队列
        )
        
        # 更新 celery_task_id
        task_record.celery_task_id = celery_task.id
        task_record.status = BatchTaskStatus.QUEUED.value
        await db.commit()
        
    except Exception as e:
        logger.error(f"提交 Celery 任务失败: {e}")
        # 回滚次数
        await credit_service.add_credits(
            user_id=current_user.id,
            amount=total_credits,
            description=f"批量生成任务提交失败退款: {task_id[:8]}...",
            transaction_type=TransactionType.REFUND,
        )
        task_record.status = BatchTaskStatus.FAILED.value
        task_record.error_message = f"提交失败: {str(e)}"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"任务提交失败，请稍后重试"
        )
    
    return task_record.to_dict()


@router.get("/tasks", response_model=BatchTaskListResponse)
async def list_batch_tasks(
    status: Optional[str] = Query(None, description="按状态筛选", enum=[s.value for s in BatchTaskStatus]),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=50, description="每页数量"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户的批量生成任务列表"""
    # 构建查询
    query = select(BatchGenerationTask).where(BatchGenerationTask.user_id == current_user.id)
    
    if status:
        query = query.where(BatchGenerationTask.status == status)
    
    # 统计总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 分页查询
    query = query.order_by(desc(BatchGenerationTask.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    tasks = result.scalars().all()
    
    return {
        "tasks": [task.to_dict() for task in tasks],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/tasks/{task_id}", response_model=BatchTaskResponse)
async def get_batch_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取单个任务详情"""
    result = await db.execute(
        select(BatchGenerationTask).where(
            BatchGenerationTask.id == task_id,
            BatchGenerationTask.user_id == current_user.id
        )
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # 如果任务还在运行中，获取实时进度
    if task.is_active():
        try:
            redis = await get_redis()
            progress_data = await redis.get(f"batch_task:progress:{task_id}")
            if progress_data:
                import json
                progress = json.loads(progress_data)
                # 合并实时进度
                response = task.to_dict()
                response["progress"]["current"] = progress.get("current", task.completed_count)
                return response
        except Exception as e:
            logger.warning(f"获取实时进度失败: {e}")
    
    return task.to_dict()


@router.post("/tasks/{task_id}/cancel")
async def cancel_batch_task(
    task_id: str,
    request: CancelBatchRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    取消批量生成任务
    
    1. 检查任务所有权
    2. 检查任务是否可取消
    3. 发送取消信号
    """
    result = await db.execute(
        select(BatchGenerationTask).where(
            BatchGenerationTask.id == task_id,
            BatchGenerationTask.user_id == current_user.id
        )
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    if not task.can_cancel():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"任务当前状态为 {task.status}，无法取消"
        )
    
    # 发送取消任务到 Celery
    reason = request.reason if request else "用户取消"
    
    try:
        cancel_result = celery_app.send_task(
            "app.tasks.batch_generation_tasks.cancel_batch_task",
            args=[task_id, "user", reason],
            queue="batch",
        )
        
        return {
            "status": "success",
            "message": "取消请求已提交",
            "task_id": task_id,
        }
        
    except Exception as e:
        logger.error(f"提交取消任务失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="取消请求提交失败"
        )


@router.get("/tasks/{task_id}/progress")
async def get_task_progress(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取任务实时进度（WebSocket 替代方案）"""
    result = await db.execute(
        select(BatchGenerationTask).where(
            BatchGenerationTask.id == task_id,
            BatchGenerationTask.user_id == current_user.id
        )
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    progress_data = {
        "task_id": task_id,
        "status": task.status,
        "progress": task.to_dict()["progress"],
    }
    
    # 获取实时进度
    if task.is_active():
        try:
            redis = await get_redis()
            real_time = await redis.get(f"batch_task:progress:{task_id}")
            if real_time:
                import json
                progress_data["real_time"] = json.loads(real_time)
        except Exception as e:
            logger.warning(f"获取实时进度失败: {e}")
    
    return progress_data


@router.delete("/tasks/{task_id}")
async def delete_batch_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除已完成的批量任务"""
    result = await db.execute(
        select(BatchGenerationTask).where(
            BatchGenerationTask.id == task_id,
            BatchGenerationTask.user_id == current_user.id
        )
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="任务不存在"
        )
    
    # 只能删除已完成、已取消或失败的任务
    if task.is_active():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只能删除已完成的任务"
        )
    
    await db.delete(task)
    await db.commit()
    
    return {"status": "success", "message": "任务已删除"}


@router.get("/stats")
async def get_batch_generation_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取用户的批量生成统计"""
    # 总任务数
    total_result = await db.execute(
        select(func.count()).where(BatchGenerationTask.user_id == current_user.id)
    )
    total = total_result.scalar()
    
    # 各状态统计
    status_counts = {}
    for status in BatchTaskStatus:
        count_result = await db.execute(
            select(func.count()).where(
                BatchGenerationTask.user_id == current_user.id,
                BatchGenerationTask.status == status.value
            )
        )
        status_counts[status.value] = count_result.scalar()
    
    # 成功生成的图片数
    completed_result = await db.execute(
        select(func.sum(BatchGenerationTask.completed_count)).where(
            BatchGenerationTask.user_id == current_user.id
        )
    )
    total_generated = completed_result.scalar() or 0
    
    # 消耗的积分
    credits_result = await db.execute(
        select(
            func.sum(BatchGenerationTask.total_credits),
            func.sum(BatchGenerationTask.refunded_credits)
        ).where(BatchGenerationTask.user_id == current_user.id)
    )
    total_credits, refunded_credits = credits_result.first() or (0, 0)
    
    return {
        "total_tasks": total,
        "status_counts": status_counts,
        "total_generated": total_generated,
        "credits": {
            "total": total_credits or 0,
            "refunded": refunded_credits or 0,
            "net": (total_credits or 0) - (refunded_credits or 0),
        },
    }
