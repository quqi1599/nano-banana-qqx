"""
API 速率限制器
"""
from fastapi import HTTPException, status, Request
from app.utils.redis_client import redis_client


class RateLimiter:
    def __init__(self, times: int = 5, seconds: int = 60):
        self.times = times
        self.seconds = seconds

    async def __call__(self, request: Request):
        if not redis_client:
            return

        ip = request.client.host
        key = f"rate_limit:{ip}:{request.url.path}"

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
