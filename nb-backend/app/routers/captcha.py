"""
滑块验证码路由（简化版）
"""
from __future__ import annotations

import secrets
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings
from app.utils.captcha import sign_captcha_ticket

router = APIRouter()
settings = get_settings()

ALLOWED_PURPOSES = {"register", "login", "reset"}

TRACK_WIDTH = 320
HANDLE_WIDTH = 44
# 滑块需要拖到至少 85% 的位置
MIN_REQUIRED_RATIO = 0.85


class VerifyReq(BaseModel):
    challenge_id: str
    final_x: float
    use: str


class VerifyResp(BaseModel):
    ok: bool
    ticket: Optional[str] = None


@router.get("/slider/challenge")
async def slider_challenge() -> Dict[str, Any]:
    """获取滑块验证配置"""
    return {
        "challenge_id": "simple",  # 简化版不需要真正的 challenge_id
        "track_width": TRACK_WIDTH,
        "handle_width": HANDLE_WIDTH,
        "expires_in": settings.captcha_challenge_ttl_seconds,
    }


@router.post("/slider/verify", response_model=VerifyResp)
async def slider_verify(req: VerifyReq) -> VerifyResp:
    """验证滑块位置 - 只需要拖到最右边"""
    if req.use not in ALLOWED_PURPOSES:
        return VerifyResp(ok=False)

    max_x = float(TRACK_WIDTH - HANDLE_WIDTH)
    required_min_x = max_x * MIN_REQUIRED_RATIO

    # 检查是否拖到了足够右边的位置
    if req.final_x < required_min_x:
        return VerifyResp(ok=False)

    # 验证通过，签发 ticket
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
