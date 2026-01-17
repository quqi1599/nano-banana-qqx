"""
Queue monitor helpers for Celery task tracking.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from typing import Any, Dict, Optional

import redis

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

QUEUE_MONITOR_QUEUE_NAMES = ("default", "email", "cleanup", "api", "stats", "low")
QUEUE_MONITOR_STATUSES = ("pending", "active", "succeeded", "failed", "revoked")

QUEUE_TASK_KEY_PREFIX = "queue:tasks:data:"
QUEUE_TASKS_RECENT_KEY = "queue:tasks:recent"
QUEUE_TASKS_STATUS_KEY_PREFIX = "queue:tasks:status:"
QUEUE_TASKS_COMPLETED_KEY_PREFIX = "queue:tasks:completed:"

QUEUE_TASK_TTL_SECONDS = 7 * 24 * 60 * 60
QUEUE_TASK_MAX_ENTRIES = 2000
QUEUE_TASK_MAX_FIELD_LENGTH = 4000
QUEUE_TASK_MAX_RESULT_LENGTH = 8000
QUEUE_TASK_MAX_TRACEBACK_LENGTH = 12000


_sync_redis_client = redis.from_url(
    settings.redis_url,
    encoding="utf-8",
    decode_responses=True,
    max_connections=20,
    socket_timeout=5,
    socket_connect_timeout=5,
    retry_on_timeout=True,
)


def get_queue_monitor_redis() -> redis.Redis:
    return _sync_redis_client


def build_task_key(task_id: str) -> str:
    return f"{QUEUE_TASK_KEY_PREFIX}{task_id}"


def build_status_key(status: str) -> str:
    return f"{QUEUE_TASKS_STATUS_KEY_PREFIX}{status}"


def build_completed_key(status: str) -> str:
    return f"{QUEUE_TASKS_COMPLETED_KEY_PREFIX}{status}"


def utc_now() -> tuple[str, float]:
    now = datetime.utcnow()
    return now.isoformat(), now.timestamp()


def _truncate_text(value: str, max_length: int) -> str:
    if len(value) <= max_length:
        return value
    return value[:max_length] + "...(truncated)"


def _normalize_json(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str, ensure_ascii=True))


def _sanitize_value(value: Any, max_length: int) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        return _truncate_text(value, max_length)
    try:
        raw = json.dumps(value, default=str, ensure_ascii=True)
    except TypeError:
        return _truncate_text(str(value), max_length)
    if len(raw) <= max_length:
        return _normalize_json(value)
    return _truncate_text(raw, max_length)


def merge_task_data(existing: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(existing)
    for key, value in updates.items():
        if value is None:
            continue
        if key in {"args", "kwargs", "queue", "worker"}:
            merged[key] = _sanitize_value(value, QUEUE_TASK_MAX_FIELD_LENGTH)
        elif key == "result":
            merged[key] = _sanitize_value(value, QUEUE_TASK_MAX_RESULT_LENGTH)
        elif key == "traceback":
            merged[key] = _sanitize_value(value, QUEUE_TASK_MAX_TRACEBACK_LENGTH)
        elif key == "error":
            merged[key] = _sanitize_value(value, QUEUE_TASK_MAX_FIELD_LENGTH)
        else:
            merged[key] = value

    if "created_at" not in merged:
        merged["created_at"] = updates.get("created_at") or utc_now()[0]
        merged["created_at_ts"] = updates.get("created_at_ts") or utc_now()[1]

    if "updated_at" not in merged or "updated_at_ts" not in merged:
        updated_at, updated_at_ts = utc_now()
        merged["updated_at"] = updates.get("updated_at", updated_at)
        merged["updated_at_ts"] = updates.get("updated_at_ts", updated_at_ts)
    else:
        merged["updated_at"] = updates.get("updated_at", merged["updated_at"])
        merged["updated_at_ts"] = updates.get("updated_at_ts", merged["updated_at_ts"])

    if merged.get("duration") is None:
        time_start = merged.get("time_start")
        time_done = merged.get("time_done")
        if isinstance(time_start, (int, float)) and isinstance(time_done, (int, float)):
            merged["duration"] = max(0, time_done - time_start)

    return merged


def record_task_update(
    task_id: str,
    updates: Dict[str, Any],
    redis_client: Optional[redis.Redis] = None,
) -> Dict[str, Any]:
    client = redis_client or _sync_redis_client
    updated_at, updated_at_ts = utc_now()
    updates.setdefault("id", task_id)
    updates.setdefault("updated_at", updated_at)
    updates.setdefault("updated_at_ts", updated_at_ts)

    key = build_task_key(task_id)
    try:
        existing_raw = client.get(key)
        existing = json.loads(existing_raw) if existing_raw else {}
        previous_status = existing.get("status")
        merged = merge_task_data(existing, updates)
        status = merged.get("status")
        pipe = client.pipeline()
        pipe.set(key, json.dumps(merged, ensure_ascii=True))
        pipe.expire(key, QUEUE_TASK_TTL_SECONDS)
        pipe.zadd(QUEUE_TASKS_RECENT_KEY, {task_id: merged["updated_at_ts"]})
        if status:
            pipe.zadd(build_status_key(status), {task_id: merged["updated_at_ts"]})
        if previous_status and previous_status != status:
            pipe.zrem(build_status_key(previous_status), task_id)
        if status in {"succeeded", "failed"}:
            completed_ts = merged.get("time_done") or merged.get("updated_at_ts")
            pipe.zadd(build_completed_key(status), {task_id: completed_ts})
        pipe.execute()

        cutoff = time.time() - QUEUE_TASK_TTL_SECONDS
        client.zremrangebyscore(QUEUE_TASKS_RECENT_KEY, 0, cutoff)
        for status_name in QUEUE_MONITOR_STATUSES:
            client.zremrangebyscore(build_status_key(status_name), 0, cutoff)
            if status_name in {"succeeded", "failed"}:
                client.zremrangebyscore(build_completed_key(status_name), 0, cutoff)

        if client.zcard(QUEUE_TASKS_RECENT_KEY) > QUEUE_TASK_MAX_ENTRIES:
            excess = client.zcard(QUEUE_TASKS_RECENT_KEY) - QUEUE_TASK_MAX_ENTRIES
            client.zremrangebyrank(QUEUE_TASKS_RECENT_KEY, 0, max(excess - 1, 0))

        return merged
    except Exception as exc:
        logger.warning("Queue monitor update failed for %s: %s", task_id, exc)
        return {}
