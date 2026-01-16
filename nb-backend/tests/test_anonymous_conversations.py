import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import AsyncSessionLocal
from app.models.conversation import Conversation
from sqlalchemy import select, delete

@pytest.mark.anyio
async def test_create_and_get_conversation_anonymous():
    visitor_id = "test-visitor-integration"
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Create conversation
        create_resp = await ac.post(
            "/api/conversations",
            json={"title": "Integration Test", "model_name": "gemini-3-pro-image-preview"},
            headers={"X-Visitor-Id": visitor_id}
        )
        assert create_resp.status_code == 201
        conv_data = create_resp.json()
        conv_id = conv_data["id"]
        assert conv_data["visitor_id"] == visitor_id
        
        # 2. Add message
        msg_resp = await ac.post(
            f"/api/conversations/{conv_id}/messages",
            json={
                "role": "user",
                "content": "Hello from guest",
                "is_thought": False
            },
            headers={"X-Visitor-Id": visitor_id}
        )
        assert msg_resp.status_code == 201
        
        # 3. Get conversations list
        list_resp = await ac.get(
            "/api/conversations",
            headers={"X-Visitor-Id": visitor_id}
        )
        assert list_resp.status_code == 200
        conversations = list_resp.json()
        assert any(c["id"] == conv_id for c in conversations)

        # 4. Get specific conversation
        detail_resp = await ac.get(
            f"/api/conversations/{conv_id}",
            headers={"X-Visitor-Id": visitor_id}
        )
        assert detail_resp.status_code == 200
        detail_data = detail_resp.json()
        assert detail_data["id"] == conv_id
        assert len(detail_data["messages"]) >= 1

    # Cleanup
    async with AsyncSessionLocal() as session:
        await session.execute(delete(Conversation).where(Conversation.visitor_id == visitor_id))
        await session.commit()

@pytest.mark.anyio
async def test_access_denied_without_visitor_id():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Try to get conversations without any auth or visitor id
        resp = await ac.get("/api/conversations")
        assert resp.status_code == 401

        create_resp = await ac.post(
            "/api/conversations",
            json={"title": "Should Fail"}
        )
        # It fails because _get_conversation_filter returns 401 if no user and no visitor_id
        assert create_resp.status_code == 401

@pytest.mark.anyio
async def test_admin_visibility_of_anonymous_conversations(monkeypatch):
    from app.routers import admin as admin_router
    from app.models.user import User as UserModel
    
    visitor_id = "test-visitor-admin-view"
    
    # Mock admin user dependency
    async def mock_get_admin_user():
        return UserModel(id="admin-1", email="admin@test.com", is_admin=True)
    
    app.dependency_overrides[admin_router.get_admin_user] = mock_get_admin_user
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Create a guest conversation
        await ac.post(
            "/api/conversations",
            json={"title": "Admin View Test", "model_name": "gemini-3-pro-image-preview"},
            headers={"X-Visitor-Id": visitor_id}
        )
        
        # 2. Access admin list
        admin_resp = await ac.get("/api/admin/conversations")
        assert admin_resp.status_code == 200
        admin_data = admin_resp.json()
        
        # Find our guest conversation
        guest_conv = next((c for c in admin_data if c["visitor_id"] == visitor_id), None)
        assert guest_conv is not None
        assert guest_conv["user_email"] == "Guest"
        assert guest_conv["user_nickname"] == "Anonymous"

    # Cleanup overrides and DB
    app.dependency_overrides.clear()
    async with AsyncSessionLocal() as session:
        await session.execute(delete(Conversation).where(Conversation.visitor_id == visitor_id))
        await session.commit()
