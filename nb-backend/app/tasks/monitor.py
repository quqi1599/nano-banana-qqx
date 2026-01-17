"""
Celery task signal hooks for queue monitoring.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional

from celery import signals

from app.utils.queue_monitor import record_task_update

logger = logging.getLogger(__name__)


def _now_ts() -> float:
    return datetime.utcnow().timestamp()


def _get_queue_name(request: Any) -> Optional[str]:
    delivery_info = getattr(request, "delivery_info", None) or {}
    return delivery_info.get("routing_key")


def _build_base_update(request: Any) -> Dict[str, Any]:
    return {
        "name": getattr(request, "name", None),
        "queue": _get_queue_name(request),
        "worker": getattr(request, "hostname", None),
    }


@signals.task_received.connect
def on_task_received(sender=None, request=None, **kwargs):
    if not request or not getattr(request, "id", None):
        return
    updates = _build_base_update(request)
    updates.update(
        {
            "status": "pending",
            "args": getattr(request, "args", None),
            "kwargs": getattr(request, "kwargs", None),
            "time_received": _now_ts(),
        }
    )
    record_task_update(request.id, updates)


@signals.task_prerun.connect
def on_task_prerun(sender=None, task_id=None, task=None, args=None, kwargs=None, **extras):
    if not task_id:
        return
    request = getattr(task, "request", None)
    updates = _build_base_update(request) if request else {}
    updates.update(
        {
            "status": "active",
            "args": args,
            "kwargs": kwargs,
            "time_start": _now_ts(),
        }
    )
    record_task_update(task_id, updates)


@signals.task_success.connect
def on_task_success(sender=None, result=None, **kwargs):
    request = getattr(sender, "request", None)
    task_id = getattr(request, "id", None)
    if not task_id:
        return
    updates = _build_base_update(request)
    updates.update(
        {
            "status": "succeeded",
            "result": result,
            "time_done": _now_ts(),
            "retries": getattr(request, "retries", None),
        }
    )
    record_task_update(task_id, updates)


@signals.task_failure.connect
def on_task_failure(sender=None, task_id=None, exception=None, traceback=None, einfo=None, **kwargs):
    if not task_id:
        return
    request = getattr(sender, "request", None)
    updates = _build_base_update(request) if request else {}
    updates.update(
        {
            "status": "failed",
            "error": str(exception) if exception else None,
            "traceback": traceback,
            "time_done": _now_ts(),
            "retries": getattr(request, "retries", None) if request else None,
        }
    )
    record_task_update(task_id, updates)


@signals.task_retry.connect
def on_task_retry(sender=None, request=None, reason=None, einfo=None, **kwargs):
    if not request or not getattr(request, "id", None):
        return
    updates = _build_base_update(request)
    updates.update(
        {
            "status": "pending",
            "error": str(reason) if reason else None,
            "retries": getattr(request, "retries", None),
            "time_retry": _now_ts(),
        }
    )
    record_task_update(request.id, updates)


@signals.task_revoked.connect
def on_task_revoked(request=None, terminated=None, signum=None, expired=None, **kwargs):
    if not request or not getattr(request, "id", None):
        return
    updates = _build_base_update(request)
    updates.update(
        {
            "status": "revoked",
            "error": "revoked",
            "time_done": _now_ts(),
        }
    )
    record_task_update(request.id, updates)
