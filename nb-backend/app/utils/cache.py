"""
Simple Redis JSON cache helpers.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.utils.redis_client import redis_client

logger = logging.getLogger(__name__)


async def get_cached_json(key: str) -> Optional[Any]:
    try:
        raw = await redis_client.get(key)
    except Exception as exc:  # pragma: no cover - best effort cache
        logger.warning("Redis cache get failed: %s", exc)
        return None

    if not raw:
        return None

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Redis cache decode failed for key %s", key)
        return None


async def set_cached_json(key: str, value: Any, ttl_seconds: int) -> None:
    try:
        await redis_client.set(key, json.dumps(value), ex=ttl_seconds)
    except Exception as exc:  # pragma: no cover - best effort cache
        logger.warning("Redis cache set failed: %s", exc)


async def delete_cache(key: str) -> None:
    try:
        await redis_client.delete(key)
    except Exception as exc:  # pragma: no cover - best effort cache
        logger.warning("Redis cache delete failed: %s", exc)
