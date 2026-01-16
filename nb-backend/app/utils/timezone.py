"""
统一时区处理模块

使用中国北京时间（东八区，UTC+8）作为系统统一时区。

最佳实践：
- 数据库存储 UTC 时间（不带时区信息的 naive datetime）
- 应用层使用本模块的辅助函数进行时区转换
- API 响应返回北京时间字符串
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# 东八区时区（中国北京时间）
CHINA_TZ = ZoneInfo("Asia/Shanghai")


def china_now() -> datetime:
    """
    获取当前北京时间（东八区）

    Returns:
        带时区信息的 datetime 对象
    """
    return datetime.now(CHINA_TZ)


def utc_now() -> datetime:
    """
    获取当前 UTC 时间

    Returns:
        不带时区信息的 datetime 对象（用于数据库存储）
    """
    return datetime.utcnow()


def utc_now_naive() -> datetime:
    """
    获取当前 UTC 时间（naive，不带时区信息）

    这是数据库存储的标准格式，与 datetime.utcnow() 等效

    Returns:
        不带时区信息的 naive datetime 对象
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_china_time(dt: datetime) -> datetime:
    """
    将 UTC 时间转换为北京时间

    Args:
        dt: UTC 时间（naive 或 aware）

    Returns:
        带时区信息的北京时间
    """
    if dt.tzinfo is None:
        # 假设是 UTC 时间，添加时区信息
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(CHINA_TZ)


def to_utc(dt: datetime) -> datetime:
    """
    将任意时间转换为 UTC 时间

    Args:
        dt: 任意时区的 datetime 对象

    Returns:
        UTC 时间（naive，不带时区信息）
    """
    if dt.tzinfo is None:
        # 已经是 naive，假设是 UTC
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def format_china_time(dt: datetime, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """
    格式化时间为北京时间字符串

    Args:
        dt: UTC 时间（naive 或 aware）
        fmt: 格式化字符串

    Returns:
        格式化后的北京时间字符串
    """
    china_dt = to_china_time(dt) if dt.tzinfo != CHINA_TZ else dt
    return china_dt.strftime(fmt) + " (UTC+8)"
