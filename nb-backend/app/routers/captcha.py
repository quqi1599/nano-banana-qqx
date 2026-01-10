"""
滑块验证码路由
"""
from __future__ import annotations

import base64
import io
import json
import math
import random
import secrets
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from PIL import Image, ImageDraw, ImageFilter

from app.config import get_settings
from app.utils.captcha import sign_captcha_ticket
from app.utils.redis_client import redis_client

router = APIRouter()
settings = get_settings()

CHALLENGE_KEY_PREFIX = "captcha:slider:challenge:"
ALLOWED_PURPOSES = {"register", "login", "reset"}


class TracePoint(BaseModel):
    t: int = Field(..., ge=0, description="相对 pointerdown 的毫秒")
    x: float
    y: float
    pt: Optional[str] = None  # pointerType
    it: Optional[bool] = None  # isTrusted


class VerifyReq(BaseModel):
    challenge_id: str
    final_x: float
    trace: List[TracePoint]
    dpr: float = 1.0
    use: str


class VerifyResp(BaseModel):
    ok: bool
    ticket: Optional[str] = None


def _img_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _generate_background(width: int, height: int) -> Image.Image:
    base_color = (
        random.randint(140, 220),
        random.randint(140, 220),
        random.randint(140, 220),
    )
    base = Image.new("RGB", (width, height), base_color)
    noise = Image.effect_noise((width, height), random.randint(8, 20)).convert("RGB")
    img = Image.blend(base, noise, 0.25)

    draw = ImageDraw.Draw(img)
    for _ in range(8):
        x0 = random.randint(0, width - 1)
        y0 = random.randint(0, height - 1)
        x1 = random.randint(0, width - 1)
        y1 = random.randint(0, height - 1)
        color = (
            random.randint(100, 240),
            random.randint(100, 240),
            random.randint(100, 240),
        )
        draw.line((x0, y0, x1, y1), fill=color, width=1)

    return img


def _generate_piece_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    radius = max(4, size // 5)
    draw.rounded_rectangle((2, 2, size - 3, size - 3), radius=radius, fill=255)

    notch_r = max(3, size // 6)
    side = random.choice(["left", "right", "top", "bottom"])
    if side == "left":
        cx, cy = notch_r + 1, size // 2
    elif side == "right":
        cx, cy = size - notch_r - 1, size // 2
    elif side == "top":
        cx, cy = size // 2, notch_r + 1
    else:
        cx, cy = size // 2, size - notch_r - 1
    draw.ellipse((cx - notch_r, cy - notch_r, cx + notch_r, cy + notch_r), fill=0)

    return mask


def _std(vals: List[float]) -> float:
    if len(vals) <= 1:
        return 0.0
    mean = sum(vals) / len(vals)
    return math.sqrt(sum((v - mean) ** 2 for v in vals) / (len(vals) - 1))


def _extract_features(points: List[TracePoint]) -> Dict[str, float]:
    pts = sorted(points, key=lambda p: p.t)
    n = len(pts)
    if n < 2:
        return {"n": float(n)}

    dts: List[float] = []
    dxs: List[float] = []
    dys: List[float] = []
    dists: List[float] = []
    vxs: List[float] = []

    for i in range(1, n):
        dt = pts[i].t - pts[i - 1].t
        dx = pts[i].x - pts[i - 1].x
        dy = pts[i].y - pts[i - 1].y
        if dt <= 0:
            continue
        dist = math.hypot(dx, dy)
        dts.append(float(dt))
        dxs.append(float(dx))
        dys.append(float(dy))
        dists.append(float(dist))
        vxs.append(float(dx / dt))

    total_ms = float(pts[-1].t - pts[0].t)
    disp_x = float(pts[-1].x - pts[0].x)
    path = float(sum(dists)) if dists else 0.0
    y_vals = [p.y for p in pts]
    y_range = float(max(y_vals) - min(y_vals)) if y_vals else 0.0
    straight = abs(disp_x) / path if path > 1e-6 else 1.0

    v_abs = [abs(v) for v in vxs]
    v_mean = sum(v_abs) / len(v_abs) if v_abs else 0.0
    v_std = _std(v_abs) if v_abs else 0.0
    v_cv = v_std / v_mean if v_mean > 1e-6 else 0.0

    dt_std = _std(dts) if dts else 0.0
    dt_unique = float(len(set(dts))) if dts else 0.0

    sign_changes = 0
    last_sign = 0
    for dx in dxs:
        s = 1 if dx > 0.5 else (-1 if dx < -0.5 else 0)
        if s != 0 and last_sign != 0 and s != last_sign:
            sign_changes += 1
        if s != 0:
            last_sign = s

    x0 = pts[0].x
    x_end = pts[-1].x
    total_dx = x_end - x0 if abs(x_end - x0) > 1e-6 else 1e-6
    idx_mid = 0
    idx_2_3 = 0
    for i, p in enumerate(pts):
        ratio = (p.x - x0) / total_dx
        if ratio >= 0.5 and idx_mid == 0:
            idx_mid = i
        if ratio >= 2 / 3 and idx_2_3 == 0:
            idx_2_3 = i
    idx_mid = idx_mid or (n // 2)
    idx_2_3 = idx_2_3 or (2 * n // 3)

    def avg_speed(i0: int, i1: int) -> float:
        if i1 <= i0 + 1:
            return 0.0
        dx = pts[i1].x - pts[i0].x
        dt = pts[i1].t - pts[i0].t
        return abs(dx / dt) if dt > 0 else 0.0

    v_first = avg_speed(0, idx_mid)
    v_last = avg_speed(idx_2_3, n - 1)
    decel_ratio = v_last / v_first if v_first > 1e-6 else 1.0

    end_micro = 0
    t_end = pts[-1].t
    for i in range(1, n):
        if pts[i].t >= t_end - 200:
            dx = abs(pts[i].x - pts[i - 1].x)
            if 0.1 <= dx <= 2.0:
                end_micro += 1

    max_jump_dx = 0.0
    min_dt = None
    for dt, dx in zip(dts, dxs):
        max_jump_dx = max(max_jump_dx, abs(dx))
        if min_dt is None or dt < min_dt:
            min_dt = dt

    it_flags = [p.it for p in pts if p.it is not None]
    untrusted = any(flag is False for flag in it_flags)

    return {
        "n": float(n),
        "total_ms": total_ms,
        "disp_x": disp_x,
        "path": path,
        "straight": straight,
        "y_range": y_range,
        "v_mean": v_mean,
        "v_cv": v_cv,
        "dt_std": dt_std,
        "dt_unique": dt_unique,
        "sign_changes": float(sign_changes),
        "decel_ratio": float(decel_ratio),
        "end_micro": float(end_micro),
        "max_jump_dx": float(max_jump_dx),
        "min_dt": float(min_dt) if min_dt is not None else 0.0,
        "untrusted": 1.0 if untrusted else 0.0,
    }


def _risk_score(feats: Dict[str, float]) -> int:
    score = 0

    total_ms = feats.get("total_ms", 0.0)
    n = feats.get("n", 0.0)
    v_cv = feats.get("v_cv", 0.0)
    dt_std = feats.get("dt_std", 0.0)
    dt_unique = feats.get("dt_unique", 0.0)
    straight = feats.get("straight", 1.0)
    y_range = feats.get("y_range", 0.0)
    sign_changes = feats.get("sign_changes", 0.0)
    decel_ratio = feats.get("decel_ratio", 1.0)
    end_micro = feats.get("end_micro", 0.0)
    max_jump_dx = feats.get("max_jump_dx", 0.0)
    untrusted = feats.get("untrusted", 0.0)

    if total_ms < 400:
        score += 15
    if n < 12:
        score += 10
    if max_jump_dx > 60:
        score += 10

    if v_cv < 0.08:
        score += 20
    if v_cv < 0.05:
        score += 10

    if dt_unique <= 2 and dt_std < 2.0:
        score += 12

    if straight > 0.995:
        score += 10
    if y_range < 1.0:
        score += 5

    if decel_ratio > 0.95:
        score += 6
    if sign_changes == 0:
        score += 4
    if end_micro == 0:
        score += 5
    if untrusted:
        score += 12

    return min(score, 100)


def _challenge_key(challenge_id: str) -> str:
    return f"{CHALLENGE_KEY_PREFIX}{challenge_id}"


async def _save_challenge(challenge_id: str, data: Dict[str, Any]) -> None:
    now = int(time.time())
    expires_at = int(data.get("expires_at") or (now + settings.captcha_challenge_ttl_seconds))
    ttl = max(1, expires_at - now)
    await redis_client.set(_challenge_key(challenge_id), json.dumps(data), ex=ttl)


@router.get("/slider/challenge")
async def slider_challenge(request: Request) -> Dict[str, Any]:
    width = 320
    height = 160
    piece_size = 42
    margin = 8

    target_x = random.randint(margin, width - piece_size - margin)
    target_y = random.randint(margin, height - piece_size - margin)

    bg = _generate_background(width, height)
    mask = _generate_piece_mask(piece_size)

    piece = bg.crop((target_x, target_y, target_x + piece_size, target_y + piece_size)).convert("RGBA")
    piece.putalpha(mask)

    bg_rgba = bg.convert("RGBA")
    shade = Image.new("RGBA", (piece_size, piece_size), (0, 0, 0, 90))
    bg_rgba.paste(shade, (target_x, target_y), mask)
    edge = mask.filter(ImageFilter.FIND_EDGES)
    edge_rgba = Image.new("RGBA", (piece_size, piece_size), (255, 255, 255, 0))
    edge_rgba.putalpha(edge)
    bg_rgba.paste(edge_rgba, (target_x, target_y), edge_rgba)

    challenge_id = secrets.token_urlsafe(24)
    now = int(time.time())
    expires_at = now + settings.captcha_challenge_ttl_seconds

    challenge_data = {
        "target_x": float(target_x),
        "target_y": float(target_y),
        "w": width,
        "h": height,
        "piece_size": piece_size,
        "created_at": now,
        "expires_at": expires_at,
        "used": False,
        "attempts": 0,
        "ip": request.client.host if request.client else None,
        "ua": request.headers.get("user-agent", ""),
    }

    await _save_challenge(challenge_id, challenge_data)

    return {
        "challenge_id": challenge_id,
        "bg": f"data:image/png;base64,{_img_to_b64(bg_rgba)}",
        "piece": f"data:image/png;base64,{_img_to_b64(piece)}",
        "w": width,
        "h": height,
        "piece_size": piece_size,
        "piece_y": target_y,
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

    target_x = float(challenge.get("target_x", 0.0))
    width = int(challenge.get("w", 0))
    piece_size = int(challenge.get("piece_size", 0))
    dpr = req.dpr or 1.0

    if req.final_x < 0 or req.final_x > max(0, width - piece_size):
        await _save_challenge(req.challenge_id, challenge)
        return VerifyResp(ok=False)

    tol = max(3.0, round(2.0 * dpr))
    if abs(req.final_x - target_x) > tol:
        await _save_challenge(req.challenge_id, challenge)
        return VerifyResp(ok=False)

    pts = req.trace or []
    if len(pts) < 8:
        await _save_challenge(req.challenge_id, challenge)
        return VerifyResp(ok=False)

    pts_sorted = sorted(pts, key=lambda p: p.t)
    for i in range(1, len(pts_sorted)):
        if pts_sorted[i].t - pts_sorted[i - 1].t <= 0:
            await _save_challenge(req.challenge_id, challenge)
            return VerifyResp(ok=False)

    total_ms = pts_sorted[-1].t - pts_sorted[0].t
    if total_ms < 250:
        await _save_challenge(req.challenge_id, challenge)
        return VerifyResp(ok=False)

    max_jump = 0.0
    for i in range(1, len(pts_sorted)):
        dt = pts_sorted[i].t - pts_sorted[i - 1].t
        dx = abs(pts_sorted[i].x - pts_sorted[i - 1].x)
        max_jump = max(max_jump, dx)
        if dt < 16 and dx > 40:
            await _save_challenge(req.challenge_id, challenge)
            return VerifyResp(ok=False)

    feats = _extract_features(pts_sorted)
    feats["max_jump_dx"] = max(feats.get("max_jump_dx", 0.0), max_jump)
    score = _risk_score(feats)

    if score >= 65:
        await _save_challenge(req.challenge_id, challenge)
        return VerifyResp(ok=False)
    if score >= 45:
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
