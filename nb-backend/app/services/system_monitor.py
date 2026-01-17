"""
系统资源监控服务
监控 CPU、内存、硬盘使用率并触发告警
"""
import logging
from dataclasses import dataclass
from typing import Optional

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    psutil = None

from app.services.alert_service import (
    send_cpu_alert,
    send_memory_alert,
    send_disk_alert,
)

logger = logging.getLogger(__name__)

# 告警阈值
CPU_WARNING_THRESHOLD = 80
CPU_CRITICAL_THRESHOLD = 90
MEMORY_WARNING_THRESHOLD = 80
MEMORY_CRITICAL_THRESHOLD = 90
DISK_WARNING_THRESHOLD = 80
DISK_CRITICAL_THRESHOLD = 90


@dataclass
class SystemStats:
    """系统资源统计"""
    cpu_percent: float
    memory_percent: float
    memory_total_gb: float
    memory_used_gb: float
    disk_percent: float
    disk_total_gb: float
    disk_used_gb: float
    disk_free_gb: float


def get_system_stats() -> Optional[SystemStats]:
    """获取系统资源使用情况"""
    if not PSUTIL_AVAILABLE:
        logger.warning("psutil 未安装，无法获取系统资源信息")
        return None
    
    try:
        # CPU 使用率（1秒采样）
        cpu_percent = psutil.cpu_percent(interval=1)
        
        # 内存信息
        memory = psutil.virtual_memory()
        memory_percent = memory.percent
        memory_total_gb = memory.total / (1024 ** 3)
        memory_used_gb = memory.used / (1024 ** 3)
        
        # 硬盘信息（根目录）
        disk = psutil.disk_usage('/')
        disk_percent = disk.percent
        disk_total_gb = disk.total / (1024 ** 3)
        disk_used_gb = disk.used / (1024 ** 3)
        disk_free_gb = disk.free / (1024 ** 3)
        
        return SystemStats(
            cpu_percent=cpu_percent,
            memory_percent=memory_percent,
            memory_total_gb=memory_total_gb,
            memory_used_gb=memory_used_gb,
            disk_percent=disk_percent,
            disk_total_gb=disk_total_gb,
            disk_used_gb=disk_used_gb,
            disk_free_gb=disk_free_gb,
        )
    except Exception as e:
        logger.error(f"获取系统资源信息失败: {e}")
        return None


def check_and_alert() -> dict[str, bool]:
    """检查系统资源并触发告警"""
    stats = get_system_stats()
    if stats is None:
        return {"error": True}
    
    results = {
        "cpu_alert": False,
        "memory_alert": False,
        "disk_alert": False,
    }
    
    # 检查 CPU（优先检查严重级别）
    if stats.cpu_percent >= CPU_CRITICAL_THRESHOLD:
        results["cpu_alert"] = send_cpu_alert(stats.cpu_percent, CPU_CRITICAL_THRESHOLD)
    elif stats.cpu_percent >= CPU_WARNING_THRESHOLD:
        results["cpu_alert"] = send_cpu_alert(stats.cpu_percent, CPU_WARNING_THRESHOLD)
    
    # 检查内存
    if stats.memory_percent >= MEMORY_CRITICAL_THRESHOLD:
        results["memory_alert"] = send_memory_alert(
            stats.memory_percent, MEMORY_CRITICAL_THRESHOLD,
            stats.memory_total_gb, stats.memory_used_gb
        )
    elif stats.memory_percent >= MEMORY_WARNING_THRESHOLD:
        results["memory_alert"] = send_memory_alert(
            stats.memory_percent, MEMORY_WARNING_THRESHOLD,
            stats.memory_total_gb, stats.memory_used_gb
        )
    
    # 检查硬盘
    if stats.disk_percent >= DISK_CRITICAL_THRESHOLD:
        results["disk_alert"] = send_disk_alert(
            stats.disk_percent, DISK_CRITICAL_THRESHOLD,
            stats.disk_total_gb, stats.disk_used_gb, stats.disk_free_gb
        )
    elif stats.disk_percent >= DISK_WARNING_THRESHOLD:
        results["disk_alert"] = send_disk_alert(
            stats.disk_percent, DISK_WARNING_THRESHOLD,
            stats.disk_total_gb, stats.disk_used_gb, stats.disk_free_gb
        )
    
    logger.debug(
        f"系统资源检查完成: CPU={stats.cpu_percent:.1f}%, "
        f"内存={stats.memory_percent:.1f}%, 硬盘={stats.disk_percent:.1f}%"
    )
    
    return results
