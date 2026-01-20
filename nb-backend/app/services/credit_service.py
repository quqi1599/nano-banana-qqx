"""
积分服务 - 统一管理用户积分的扣除、退款和记录

此服务提供：
1. 原子性的积分扣除操作
2. 退款操作（带业务原因记录）
3. 统一的事务管理
4. 完整的审计日志
"""
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import HTTPException, status

from app.models.user import User
from app.models.credit import CreditTransaction, TransactionType
from app.models.usage_log import UsageLog


class CreditOperationError(Exception):
    """积分操作异常"""
    def __init__(self, message: str, error_code: str = "CREDIT_ERROR"):
        self.message = message
        self.error_code = error_code
        super().__init__(message)


class CreditService:
    """
    积分服务类 - 统一管理积分操作

    使用方式:
        service = CreditService(db)
        await service.reserve(user_id, credits, model_name)
        # ... 业务逻辑 ...
        if success:
            await service.confirm()
        else:
            await service.refund("请求失败")
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._reserved = False
        self._user_id: Optional[str] = None
        self._credits_to_use: int = 0
        self._model_name: str = ""
        self._balance_before: int = 0
        self._balance_after: int = 0
        self._transaction: Optional[CreditTransaction] = None

    async def reserve(
        self,
        user_id: str,
        credits_to_use: int,
        model_name: str,
    ) -> int:
        """
        预留用户积分（原子操作）

        Args:
            user_id: 用户 ID
            credits_to_use: 需要扣除的积分数
            model_name: 使用的模型名称

        Returns:
            扣除后的余额

        Raises:
            CreditOperationError: 积分不足或用户不存在
        """
        if credits_to_use <= 0:
            raise CreditOperationError("扣除积分数必须大于 0", "INVALID_AMOUNT")

        result = await self.db.execute(
            update(User)
            .where(User.id == user_id, User.credit_balance >= credits_to_use)
            .values(credit_balance=User.credit_balance - credits_to_use)
            .returning(User.credit_balance)
        )
        balance_after = result.scalar_one_or_none()

        if balance_after is None:
            # 用户不存在或余额不足，查询当前余额
            balance_result = await self.db.execute(
                select(User.credit_balance).where(User.id == user_id)
            )
            current_balance = balance_result.scalar_one_or_none()
            if current_balance is None:
                raise CreditOperationError("用户不存在", "USER_NOT_FOUND")
            raise CreditOperationError(
                f"灵感值不足，需要 {credits_to_use} 灵感值，当前余额 {current_balance}",
                "INSUFFICIENT_CREDITS",
            )

        # 记录交易
        self._balance_after = balance_after
        self._balance_before = balance_after + credits_to_use
        self._transaction = CreditTransaction(
            user_id=user_id,
            amount=-credits_to_use,
            type=TransactionType.CONSUME.value,
            description=f"使用模型: {model_name}",
            balance_after=balance_after,
        )
        self.db.add(self._transaction)

        # 标记为已预留，支持后续退款
        self._reserved = True
        self._user_id = user_id
        self._credits_to_use = credits_to_use
        self._model_name = model_name

        return balance_after

    async def refund(
        self,
        reason: str,
        db: Optional[AsyncSession] = None,
    ) -> None:
        """
        退还已预留的积分

        Args:
            reason: 退款原因（用于审计）
            db: 数据库会话（可选，用于在不同事务中退款）

        Note:
            此方法幂等，多次调用不会重复退款
        """
        if not self._reserved:
            # 如果没有预留，直接返回
            return

        # 使用传入的 db 或实例的 db
        target_db = db or self.db

        result = await target_db.execute(
            update(User)
            .where(User.id == self._user_id)
            .values(credit_balance=User.credit_balance + self._credits_to_use)
            .returning(User.credit_balance)
        )
        balance_after = result.scalar_one_or_none()
        if balance_after is not None:
            target_db.add(CreditTransaction(
                user_id=self._user_id,
                amount=self._credits_to_use,
                type=TransactionType.BONUS.value,
                description=f"{reason}: {self._model_name}",
                balance_after=balance_after,
            ))

        # 清除预留标记，防止重复退款
        self._reserved = False

    def confirm(self) -> None:
        """
        确认积分扣除（提交事务）

        Note:
            实际的扣除已在 reserve() 时完成。
            此方法用于语义上的确认，表明业务操作成功。
        """
        # 积分已在 reserve 时扣除，这里只需要清除预留标记
        self._reserved = False

    @property
    def is_reserved(self) -> bool:
        """是否已预留积分"""
        return self._reserved

    @property
    def balance_before(self) -> int:
        """扣除前余额"""
        return self._balance_before

    @property
    def balance_after(self) -> int:
        """扣除后余额"""
        return self._balance_after


async def reserve_user_credits(
    db: AsyncSession,
    user_id: str,
    credits_to_use: int,
    model_name: str,
) -> int:
    """
    便捷函数：预留用户积分（兼容旧代码）

    Args:
        db: 数据库会话
        user_id: 用户 ID
        credits_to_use: 需要扣除的积分数
        model_name: 使用的模型名称

    Returns:
        扣除后的余额

    Raises:
        HTTPException: 积分不足或用户不存在
    """
    service = CreditService(db)
    try:
        return await service.reserve(user_id, credits_to_use, model_name)
    except CreditOperationError as e:
        if e.error_code == "USER_NOT_FOUND":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在",
            )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=str(e),
        )


async def refund_user_credits(
    db: AsyncSession,
    user_id: str,
    credits_to_refund: int,
    model_name: str,
    reason: str,
) -> None:
    """
    便捷函数：退还用户积分（兼容旧代码）

    Args:
        db: 数据库会话
        user_id: 用户 ID
        credits_to_refund: 需要退还的积分数
        model_name: 模型名称（用于记录）
        reason: 退款原因
    """
    result = await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(credit_balance=User.credit_balance + credits_to_refund)
        .returning(User.credit_balance)
    )
    balance_after = result.scalar_one_or_none()
    if balance_after is not None:
        db.add(CreditTransaction(
            user_id=user_id,
            amount=credits_to_refund,
            type=TransactionType.BONUS.value,
            description=f"{reason}: {model_name}",
            balance_after=balance_after,
        ))


async def record_usage(
    db: AsyncSession,
    user_id: str,
    model_name: str,
    credits_used: int,
    token_id: str,
    request_type: str,
    prompt_preview: str,
    is_success: bool,
    error_message: Optional[str] = None,
) -> None:
    """
    记录 API 使用日志

    Args:
        db: 数据库会话
        user_id: 用户 ID
        model_name: 模型名称
        credits_used: 使用的积分数
        token_id: 使用的 Token ID
        request_type: 请求类型 (generate/generate_stream)
        prompt_preview: 提示词预览
        is_success: 是否成功
        error_message: 错误消息（可选）
    """
    db.add(UsageLog(
        user_id=user_id,
        model_name=model_name,
        credits_used=credits_used,
        token_id=token_id,
        request_type=request_type,
        prompt_preview=prompt_preview[:200] if prompt_preview else None,
        is_success=is_success,
        error_message=error_message,
    ))
