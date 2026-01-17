"""
Redis 客户端
"""
import redis.asyncio as redis
from app.config import get_settings

settings = get_settings()
celery_redis_url = settings.celery_broker or settings.redis_url

# Redis 连接池配置
# 防止高并发下连接池耗尽
redis_client = redis.from_url(
    settings.redis_url,
    encoding="utf-8",
    decode_responses=True,
    # 连接池配置
    max_connections=50,           # 最大连接数
    # 超时配置
    socket_timeout=5,             # 读写超时（秒）
    socket_connect_timeout=5,     # 连接超时（秒）
    # 重试配置
    retry_on_timeout=True,        # 超时时自动重试
    retry_on_error=[redis.ConnectionError, redis.TimeoutError],
    # 健康检查
    health_check_interval=30,     # 健康检查间隔（秒）
)

celery_redis_client = (
    redis_client
    if celery_redis_url == settings.redis_url
    else redis.from_url(
        celery_redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=50,
        socket_timeout=5,
        socket_connect_timeout=5,
        retry_on_timeout=True,
        retry_on_error=[redis.ConnectionError, redis.TimeoutError],
        health_check_interval=30,
    )
)


async def get_redis():
    """获取 Redis 客户端"""
    return redis_client


async def get_celery_redis():
    """获取 Celery Broker Redis 客户端"""
    return celery_redis_client
