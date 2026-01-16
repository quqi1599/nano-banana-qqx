"""
滑块验证码路由（简化版）
"""
from __future__ import annotations

import json
import secrets
import time
import random
from typing import Any, Dict, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings
from app.utils.captcha import sign_captcha_ticket
from app.utils.redis_client import redis_client

router = APIRouter()
settings = get_settings()

CHALLENGE_KEY_PREFIX = "captcha:slider:challenge:"
ALLOWED_PURPOSES = {"register", "login", "reset"}

TRACK_WIDTH = 320
HANDLE_WIDTH = 44
TOLERANCE_PX = 4.0
MIN_TARGET_X = 20  # 最小目标位置（距离左边）
MAX_TARGET_X = TRACK_WIDTH - HANDLE_WIDTH - 20  # 最大目标位置（距离右边）


class VerifyReq(BaseModel):
    challenge_id: str
    final_x: float
    use: str


class VerifyResp(BaseModel):
    ok: bool
    ticket: Optional[str] = None


def _challenge_key(challenge_id: str) -> str:
    return f"{CHALLENGE_KEY_PREFIX}{challenge_id}"


async def _save_challenge(challenge_id: str, data: Dict[str, Any]) -> None:
    now = int(time.time())
    expires_at = int(data.get("expires_at") or (now + settings.captcha_challenge_ttl_seconds))
    ttl = max(1, expires_at - now)
    await redis_client.set(_challenge_key(challenge_id), json.dumps(data), ex=ttl)


@router.get("/slider/challenge")
async def slider_challenge() -> Dict[str, Any]:
    challenge_id = secrets.token_urlsafe(24)
    now = int(time.time())
    expires_at = now + settings.captcha_challenge_ttl_seconds
    max_x = float(TRACK_WIDTH - HANDLE_WIDTH)

    # 生成随机目标位置，使验证码不可预测
    target_x = round(random.uniform(MIN_TARGET_X, MAX_TARGET_X), 2)

    challenge_data = {
        "target_x": target_x,
        "max_x": max_x,
        "track_width": TRACK_WIDTH,
        "handle_width": HANDLE_WIDTH,
        "created_at": now,
        "expires_at": expires_at,
        "used": False,
        "attempts": 0,
    }

    await _save_challenge(challenge_id, challenge_data)

    return {
        "challenge_id": challenge_id,
        "track_width": TRACK_WIDTH,
        "handle_width": HANDLE_WIDTH,
        "expires_in": settings.captcha_challenge_ttl_seconds,
    }


@router.post("/slider/verify", response_model=VerifyResp)
async def slider_verify(req: VerifyReq) -> VerifyResp:
    if req.use not in ALLOWED_PURPOSES:
        return VerifyResp(ok=False)

    raw = await redis_client.get(_challenge_key(req.challenge_id))
    if not raw:
        return VerifyResp(ok=False)

    try:
        challenge = json.loads(raw)
    except Exception:
        return VerifyResp(ok=False)

    if challenge.get("used"):
        return VerifyResp(ok=False)

    attempts = int(challenge.get("attempts", 0)) + 1
    challenge["attempts"] = attempts
    if attempts > settings.captcha_challenge_max_attempts:
        challenge["used"] = True
        await _save_challenge(req.challenge_id, challenge)
        return VerifyResp(ok=False)

    max_x = float(challenge.get("max_x", TRACK_WIDTH - HANDLE_WIDTH))
    target_x = float(challenge.get("target_x", max_x))

    if req.final_x < 0 or req.final_x > max_x:
        await _save_challenge(req.challenge_id, challenge)
        return VerifyResp(ok=False)

    if abs(req.final_x - target_x) > TOLERANCE_PX:
        await _save_challenge(req.challenge_id, challenge)
        return VerifyResp(ok=False)

    challenge["used"] = True
    await _save_challenge(req.challenge_id, challenge)

    now = int(time.time())
    payload = {
        "typ": "captcha_ticket",
        "use": req.use,
        "iat": now,
        "exp": now + settings.captcha_ticket_ttl_seconds,
        "jti": secrets.token_urlsafe(12),
    }
    ticket = sign_captcha_ticket(payload, settings.captcha_secret_key)
    return VerifyResp(ok=True, ticket=ticket)
