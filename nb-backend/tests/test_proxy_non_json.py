import json

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.routers import proxy as proxy_module


class FakeBegin:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None


class FakeDB:
    def __init__(self) -> None:
        self.added = []

    def add(self, item) -> None:
        self.added.append(item)

    def begin(self):
        return FakeBegin()

    async def refresh(self, _instance, with_for_update=None) -> None:
        return None

    async def commit(self) -> None:
        return None


class FakeToken:
    def __init__(self) -> None:
        self.id = "token-1"
        self.api_key = "plain-key"
        self.api_key_hash = None
        self.api_key_prefix = None
        self.api_key_suffix = None
        self.failure_count = 0
        self.cooldown_until = None
        self.last_failure_at = None
        self.is_active = True
        self.total_requests = 0
        self.last_used_at = None
        self.last_checked_at = None


class FakeUser:
    def __init__(self) -> None:
        self.id = "user-1"


class FakeResponse:
    status_code = 200

    def json(self):
        raise ValueError("not json")


class FakeEmptyResponse:
    status_code = 200

    def json(self):
        return {"candidates": []}


class FakeClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, *args, **kwargs):
        return FakeResponse()


class FakeEmptyClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, *args, **kwargs):
        return FakeEmptyResponse()


def build_request(payload: dict) -> Request:
    body = json.dumps(payload).encode("utf-8")

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/proxy/generate",
        "headers": [],
        "query_string": b"",
    }
    return Request(scope, receive)


@pytest.mark.anyio
async def test_proxy_generate_handles_non_json_upstream(monkeypatch):
    db = FakeDB()
    user = FakeUser()
    token = FakeToken()

    async def fake_get_credits_for_model(_db, _model_name):
        return 1

    async def fake_get_available_tokens(_db, lock=False):
        return [token]

    async def fake_reserve_user_credits(_db, _user_id, _credits, _model_name):
        return None

    async def fake_refund_user_credits(_db, _user_id, _credits, _model_name, _reason):
        return None

    monkeypatch.setattr(proxy_module, "get_credits_for_model", fake_get_credits_for_model)
    monkeypatch.setattr(proxy_module, "get_available_tokens", fake_get_available_tokens)
    monkeypatch.setattr(proxy_module, "reserve_user_credits", fake_reserve_user_credits)
    monkeypatch.setattr(proxy_module, "refund_user_credits", fake_refund_user_credits)
    monkeypatch.setattr(proxy_module, "decrypt_api_key", lambda _key: "plain")
    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", lambda timeout=120.0: FakeClient())
    monkeypatch.setattr(proxy_module.settings, "token_encryption_key", "")

    request = build_request({"model": "gemini-3-pro-image-preview", "contents": []})

    with pytest.raises(HTTPException) as exc:
        await proxy_module.proxy_generate(request, current_user=user, db=db)

    assert exc.value.status_code == 503


@pytest.mark.anyio
async def test_proxy_generate_refunds_on_empty_content(monkeypatch):
    db = FakeDB()
    user = FakeUser()
    token = FakeToken()
    refund_called = False

    async def fake_get_credits_for_model(_db, _model_name):
        return 1

    async def fake_get_available_tokens(_db, lock=False):
        return [token]

    async def fake_reserve_user_credits(_db, _user_id, _credits, _model_name):
        return None

    async def fake_refund_user_credits(_db, _user_id, _credits, _model_name, _reason):
        nonlocal refund_called
        refund_called = True
        return None

    monkeypatch.setattr(proxy_module, "get_credits_for_model", fake_get_credits_for_model)
    monkeypatch.setattr(proxy_module, "get_available_tokens", fake_get_available_tokens)
    monkeypatch.setattr(proxy_module, "reserve_user_credits", fake_reserve_user_credits)
    monkeypatch.setattr(proxy_module, "refund_user_credits", fake_refund_user_credits)
    monkeypatch.setattr(proxy_module, "decrypt_api_key", lambda _key: "plain")
    monkeypatch.setattr(proxy_module.httpx, "AsyncClient", lambda timeout=120.0: FakeEmptyClient())
    monkeypatch.setattr(proxy_module.settings, "token_encryption_key", "")

    request = build_request({"model": "gemini-3-pro-image-preview", "contents": []})

    with pytest.raises(HTTPException) as exc:
        await proxy_module.proxy_generate(request, current_user=user, db=db)

    assert exc.value.status_code == 503
    assert "No content generated" in str(exc.value.detail)
    assert refund_called is True
