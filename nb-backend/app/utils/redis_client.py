"""
Redis 客户端
"""
import redis.asyncio as redis
from app.config import get_settings

settings = get_settings()

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


async def get_redis():
    """获取 Redis 客户端"""
    return redis_client
