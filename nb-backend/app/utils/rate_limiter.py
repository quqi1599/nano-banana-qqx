"""
API 速率限制器

支持基于用户身份的速率限制，避免 NAT 后多个用户共享 IP 时被误伤：
- 已认证用户：使用用户 ID 进行限制
- API Key 用户：使用 API Key 进行限制
- 未认证用户：使用 IP 进行限制
"""
from fastapi import HTTPException, status, Request, Header
from app.utils.redis_client import redis_client
import hashlib


class RateLimiter:
    def __init__(self, times: int = 5, seconds: int = 60, per_user: bool = True):
        """
        Args:
            times: 时间窗口内允许的请求次数
            seconds: 时间窗口（秒）
            per_user: 是否按用户限制（True）或按 IP 限制（False）
        """
        self.times = times
        self.seconds = seconds
        self.per_user = per_user

    async def __call__(
        self,
        request: Request,
        authorization: str = Header(None),
        x_api_key: str = Header(None),
    ):
        if not redis_client:
            return

        # 获取客户端标识
        client_id = self._get_client_id(request, authorization, x_api_key)
        key = f"rate_limit:{client_id}:{request.url.path}"

        # 获取当前请求次数
        current = await redis_client.get(key)

        if current and int(current) >= self.times:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="请求过于频繁，请稍后再试"
            )

        # 增加计数
        async with redis_client.pipeline() as pipe:
            await pipe.incr(key)
            if not current:
                await pipe.expire(key, self.seconds)
            await pipe.execute()

    def _get_client_id(self, request: Request, authorization: str, x_api_key: str) -> str:
        """
        获取客户端标识符

        优先级：
        1. 已认证用户（从 JWT token 中提取用户 ID）
        2. API Key 用户（使用 API Key 的 hash）
        3. IP 地址
        """
        if self.per_user:
            # 尝试从 Authorization header 获取用户 ID
            if authorization:
                try:
                    from app.utils.security import decode_token
                    token = authorization.replace("Bearer ", "")
                    payload = decode_token(token)
                    user_id = payload.get("sub")
                    if user_id:
                        return f"user:{user_id}"
                except Exception:
                    pass  # Token 无效，回退到其他方式

            # 尝试使用 API Key
            if x_api_key:
                # 使用 API Key 的 hash 作为标识（避免明文存储）
                key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()[:16]
                return f"apikey:{key_hash}"

        # 回退到 IP 地址
        # 添加 X-Forwarded-For 支持（代理场景）
        ip = request.headers.get("X-Forwarded-For", request.client.host)
        # X-Forwarded-For 可能包含多个 IP，取第一个
        if "," in ip:
            ip = ip.split(",")[0].strip()
        return f"ip:{ip}"
