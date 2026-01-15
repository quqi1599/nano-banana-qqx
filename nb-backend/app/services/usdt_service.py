"""
USDT 支付服务
处理 TRC20/ERC20/BEP20 USDT 支付相关逻辑
"""
import os
import hashlib
import hmac
import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.payment_order import PaymentOrder, UsdtPaymentRecord
from app.models.payment_plan import PaymentPlan
from app.models.user import User
from app.models.redeem_code import RedeemCode
from app.schemas.payment import PaymentMethod, OrderStatus


# 配置
TRON_GRID_API = os.getenv("TRON_GRID_API", "https://api.trongrid.io")
TRON_COLLECTION_ADDRESS = os.getenv("TRON_COLLECTION_ADDRESS", "")  # TRC20 收款地址
ETH_COLLECTION_ADDRESS = os.getenv("ETH_COLLECTION_ADDRESS", "")  # ERC20 收款地址
BSC_COLLECTION_ADDRESS = os.getenv("BSC_COLLECTION_ADDRESS", "")  # BEP20 收款地址
PAYMENT_WEBHOOK_SECRET = os.getenv("PAYMENT_WEBHOOK_SECRET", "")  # 回调签名密钥
ORDER_EXPIRE_MINUTES = int(os.getenv("ORDER_EXPIRE_MINUTES", "30"))  # 订单过期时间（分钟）


class UsdtPaymentError(Exception):
    """USDT 支付异常"""
    pass


class UsdtPaymentService:
    """USDT 支付服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_exchange_rate(self) -> float:
        """
        获取 USDT/USD 汇率
        通常 USDT 与 USD 是 1:1 锚定，但也可能有小幅波动
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # 使用币安 API 获取汇率
                response = await client.get(
                    "https://api.binance.com/api/v3/ticker/price",
                    params={"symbol": "USDTUSDT"}
                )
                if response.status_code == 200:
                    data = response.json()
                    return float(data.get("price", 1.0))
        except Exception as e:
            print(f"获取汇率失败: {e}")

        # 默认 1:1
        return 1.0

    def get_collection_address(self, method: PaymentMethod) -> str:
        """根据支付方式获取收款地址"""
        if method == PaymentMethod.USDT_TRC20:
            if not TRON_COLLECTION_ADDRESS:
                raise UsdtPaymentError("未配置 TRC20 收款地址")
            return TRON_COLLECTION_ADDRESS
        elif method == PaymentMethod.USDT_ERC20:
            if not ETH_COLLECTION_ADDRESS:
                raise UsdtPaymentError("未配置 ERC20 收款地址")
            return ETH_COLLECTION_ADDRESS
        elif method == PaymentMethod.USDT_BEP20:
            if not BSC_COLLECTION_ADDRESS:
                raise UsdtPaymentError("未配置 BEP20 收款地址")
            return BSC_COLLECTION_ADDRESS
        else:
            raise UsdtPaymentError(f"不支持的支付方式: {method}")

    def get_network_name(self, method: PaymentMethod) -> str:
        """获取网络名称"""
        mapping = {
            PaymentMethod.USDT_TRC20: "TRC20",
            PaymentMethod.USDT_ERC20: "ERC20",
            PaymentMethod.USDT_BEP20: "BEP20",
        }
        return mapping.get(method, "Unknown")

    def generate_trade_no(self) -> str:
        """生成唯一订单号"""
        import time
        import random
        timestamp = int(time.time() * 1000)
        random_num = random.randint(1000, 9999)
        return f"PAY{timestamp}{random_num}"

    async def create_order(
        self,
        user: User,
        plan: PaymentPlan,
        payment_method: PaymentMethod,
        exchange_rate: float = 1.0
    ) -> PaymentOrder:
        """创建支付订单"""
        trade_no = self.generate_trade_no()
        wallet_address = self.get_collection_address(payment_method)
        network = self.get_network_name(payment_method)

        # USDT 通常与 USD 1:1，所以金额相同
        expected_amount = float(plan.price_usd)

        # 订单过期时间
        expires_at = datetime.utcnow() + timedelta(minutes=ORDER_EXPIRE_MINUTES)

        order = PaymentOrder(
            trade_no=trade_no,
            user_id=user.id,
            plan_id=plan.id,
            amount=float(plan.price_usd),
            credits=plan.credits,
            payment_method=payment_method.value,
            status=OrderStatus.PENDING.value,
            wallet_address=wallet_address,
            expected_amount=expected_amount,
            network=network,
            expires_at=expires_at,
        )

        self.db.add(order)
        await self.db.commit()
        await self.db.refresh(order)

        return order

    async def get_order_by_trade_no(self, trade_no: str) -> Optional[PaymentOrder]:
        """根据订单号获取订单"""
        result = await self.db.execute(
            select(PaymentOrder).where(PaymentOrder.trade_no == trade_no)
        )
        return result.scalar_one_or_none()

    async def check_order_expiry(self, order: PaymentOrder) -> bool:
        """检查订单是否过期"""
        if order.status != OrderStatus.PENDING.value:
            return False

        if order.expires_at and order.expires_at < datetime.utcnow():
            order.status = OrderStatus.EXPIRED.value
            await self.db.commit()
            return True

        return False

    async def verify_trc20_transaction(
        self,
        tx_hash: str,
        expected_amount: float,
        to_address: str,
        tolerance_percent: float = 1.0
    ) -> Dict[str, Any]:
        """
        通过 TronGrid API 验证 TRC20 交易

        Args:
            tx_hash: 交易哈希
            expected_amount: 期望金额（USDT）
            to_address: 收款地址
            tolerance_percent: 金额容差百分比

        Returns:
            验证结果字典
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # 获取交易信息
                response = await client.get(
                    f"{TRON_GRID_API}/v1/transactions/{tx_hash}"
                )

                if response.status_code != 200:
                    return {"valid": False, "error": "交易不存在"}

                data = response.json()

                # 检查交易是否成功
                if data.get("ret", [{}])[0].get("contractRet") != "SUCCESS":
                    return {"valid": False, "error": "交易未成功"}

                # 解析交易数据
                transaction = data.get("tx", {})
                raw_data = transaction.get("raw_data", {})
                contract = raw_data.get("contract", [{}])[0]

                # 检查是否是 TRC20 转账
                parameter = contract.get("parameter", {}).get("value", {})
                transfer_data = parameter.get("data", {})

                # 获取 amount 和 to_address
                amount_hex = transfer_data.get("amount", "")
                to_address_hex = transfer_data.get("to", "")

                # 转换地址格式（hex 到 base58）
                to_address_actual = self.hex_to_base58(to_address_hex)

                # 检查收款地址
                if to_address_actual.lower() != to_address.lower():
                    return {"valid": False, "error": f"收款地址不匹配: {to_address_actual} != {to_address}"}

                # 转换金额（USDT 合约有 6 位小数）
                amount = int(amount_hex, 16) / 1_000_000

                # 检查金额容差
                min_amount = expected_amount * (1 - tolerance_percent / 100)
                max_amount = expected_amount * (1 + tolerance_percent / 100)

                if not (min_amount <= amount <= max_amount):
                    return {
                        "valid": False,
                        "error": f"金额不匹配: 期望 {expected_amount}, 实际 {amount}",
                        "actual_amount": amount
                    }

                # 获取确认数
                block_number = raw_data.get("ref_block_bytes", "")
                confirmations = await self.get_trc20_confirmations(block_number)

                return {
                    "valid": True,
                    "amount": amount,
                    "from_address": transfer_data.get("owner_address", ""),
                    "to_address": to_address_actual,
                    "block_number": block_number,
                    "confirmations": confirmations,
                }

        except Exception as e:
            return {"valid": False, "error": f"验证失败: {str(e)}"}

    def hex_to_base58(self, hex_address: str) -> str:
        """将 TRON hex 地址转换为 base58 地址"""
        # 简化版转换，实际生产需要完整实现
        # 这里使用 TronGrid 的地址转换 API
        import httpx

        try:
            response = httpx.get(
                f"{TRON_GRID_API}/v1/address/to-hex",
                params={"address": hex_address}
            )
            if response.status_code == 200:
                return response.json().get("address", hex_address)
        except:
            pass

        return hex_address

    async def get_trc20_confirmations(self, block_number: str) -> int:
        """获取 TRC20 交易确认数"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{TRON_GRID_API}/v1/blocks/latest"
                )
                if response.status_code == 200:
                    latest_block = response.json().get("number", 0)
                    current_block = int(block_number, 16) if block_number else 0
                    return latest_block - current_block
        except:
            pass

        return 0

    def generate_signature(self, data: Dict[str, Any]) -> str:
        """生成回调签名"""
        # 按字母顺序排序参数
        sorted_data = sorted(data.items())
        # 拼接字符串
        sign_str = "&".join([f"{k}={v}" for k, v in sorted_data if k != "signature"])
        # HMAC SHA256 签名
        signature = hmac.new(
            PAYMENT_WEBHOOK_SECRET.encode(),
            sign_str.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature

    def verify_signature(self, data: Dict[str, Any], signature: str) -> bool:
        """验证回调签名"""
        expected = self.generate_signature(data)
        return hmac.compare_digest(expected, signature)

    async def process_payment(
        self,
        order: PaymentOrder,
        tx_hash: str,
        amount: float,
        confirmations: int = 0
    ) -> Dict[str, Any]:
        """
        处理支付成功

        Args:
            order: 订单对象
            tx_hash: 交易哈希
            amount: 实际收到金额
            confirmations: 确认数

        Returns:
            处理结果
        """
        if order.status == OrderStatus.PAID.value:
            return {"success": False, "message": "订单已支付"}

        # 更新订单状态
        order.status = OrderStatus.PROCESSING.value
        order.tx_hash = tx_hash
        order.received_amount = amount
        order.confirmations = confirmations

        await self.db.commit()

        # 如果确认数足够，直接完成支付
        required_confirmations = 6  # TRC20 通常需要 6 个确认
        if confirmations >= required_confirmations:
            return await self.complete_payment(order)

        return {
            "success": True,
            "message": f"支付已确认，等待 {required_confirmations - confirmations} 个额外确认",
            "confirmations": confirmations
        }

    async def complete_payment(self, order: PaymentOrder) -> Dict[str, Any]:
        """完成支付，生成兑换码"""
        if order.status == OrderStatus.PAID.value:
            return {"success": True, "message": "订单已支付", "redeem_code": order.redeem_code}

        # 获取用户
        result = await self.db.execute(
            select(User).where(User.id == order.user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            return {"success": False, "message": "用户不存在"}

        # 更新订单状态
        order.status = OrderStatus.PAID.value
        order.paid_at = datetime.utcnow()
        if not order.redeem_code:
            redeem_code = RedeemCode(
                credit_amount=order.credits,
                remark=f"订单 {order.trade_no}",
            )
            self.db.add(redeem_code)
            await self.db.flush()
            order.redeem_code = redeem_code.code

        await self.db.commit()

        return {
            "success": True,
            "message": "支付完成，兑换码已生成",
            "redeem_code": order.redeem_code,
        }

    async def cancel_order(self, order: PaymentOrder) -> bool:
        """取消订单"""
        if order.status not in [OrderStatus.PENDING.value, OrderStatus.PROCESSING.value]:
            return False

        order.status = OrderStatus.CANCELLED.value
        await self.db.commit()
        return True
