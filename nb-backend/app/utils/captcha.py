"""
滑块验证码票据工具
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from fastapi import HTTPException, status


def _b64u_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64u_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def sign_captcha_ticket(payload: dict, secret: str) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    return f"{_b64u_encode(body)}.{_b64u_encode(sig)}"


def verify_captcha_ticket(token: str, secret: str) -> dict:
    try:
        body_b64, sig_b64 = token.split(".", 1)
        body = _b64u_decode(body_b64)
        sig = _b64u_decode(sig_b64)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码票据无效",
        )

    expected = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码票据无效",
        )

    try:
        payload = json.loads(body.decode())
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码票据无效",
        )

    exp = payload.get("exp")
    now = int(time.time())
    if not isinstance(exp, int) or exp < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码票据已过期",
        )

    return payload


def hash_captcha_ticket(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
