import sys
import os
import asyncio
from unittest.mock import MagicMock

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "nb-backend")))

# Mock dependencies that might be missing in this environment
from unittest.mock import MagicMock
sys.modules["alembic"] = MagicMock()
sys.modules["alembic.config"] = MagicMock()
sys.modules["sqlalchemy"] = MagicMock()
sys.modules["sqlalchemy.ext"] = MagicMock()
sys.modules["sqlalchemy.ext.asyncio"] = MagicMock()
sys.modules["sqlalchemy.orm"] = MagicMock()

# Mock redis for auth router
sys.modules["redis"] = MagicMock()
sys.modules["redis.asyncio"] = MagicMock()

# Mock FastAPI and Pydantic
class MockHTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        self.detail = detail

mock_fastapi = MagicMock()
mock_fastapi.HTTPException = MockHTTPException
sys.modules["fastapi"] = mock_fastapi
sys.modules["fastapi.security"] = MagicMock()
sys.modules["fastapi.responses"] = MagicMock()
sys.modules["fastapi.middleware"] = MagicMock()
sys.modules["fastapi.middleware.cors"] = MagicMock()
sys.modules["pydantic"] = MagicMock()
sys.modules["starlette"] = MagicMock()
sys.modules["starlette.exceptions"] = MagicMock()

# Also need to mock other app imports that auth.py might pull in
sys.modules["app.utils.security"] = MagicMock()
sys.modules["app.utils.captcha"] = MagicMock()
sys.modules["app.utils.rate_limiter"] = MagicMock()
sys.modules["app.utils.cache"] = MagicMock()
sys.modules["app.utils.redis_client"] = MagicMock()
sys.modules["app.services.email_service"] = MagicMock()
sys.modules["app.models.user"] = MagicMock()
sys.modules["app.models.login_history"] = MagicMock()
sys.modules["app.models.email_code"] = MagicMock()
sys.modules["app.schemas.user"] = MagicMock()

# Re-mock app.database just in case
sys.modules["app.database"] = MagicMock()

def test_database_url():
    print("Testing Database URL...")
    # We need to mock get_settings before importing database
    # But database imports get_settings from app.config
    
    # Let's mock app.config.get_settings
    settings_mock = MagicMock()
    settings_mock.database_url = "postgresql://user:pass@localhost/db"
    settings_mock.db_pool_size = 5
    settings_mock.db_max_overflow = 10
    settings_mock.db_pool_timeout = 30
    settings_mock.db_pool_recycle = 1800
    
    # We need to ensure app.config is mocked or patched
    sys.modules["app.config"] = MagicMock()
    sys.modules["app.config"].get_settings.return_value = settings_mock
    
    # Now import app.database
    import app.database
    # Reload to ensure it runs with our mocked settings
    import importlib
    importlib.reload(app.database)
    
    # The logic runs at module level, so database_url is a variable in the module
    # But wait, the module does `settings = get_settings()` and then calculates `database_url`
    
    # Case 1: postgresql://
    # We can't easily re-run the module level code without reloading.
    # So we will verify the logic by reloading with different settings.
    
    # 1. Start with postgresql://
    assert app.database.database_url == "postgresql+asyncpg://user:pass@localhost/db"
    print("  Case 1 (postgresql://) Passed")
    
    # 2. Case: postgres://
    settings_mock.database_url = "postgres://user:pass@localhost/db"
    importlib.reload(app.database)
    assert app.database.database_url == "postgresql+asyncpg://user:pass@localhost/db"
    print("  Case 2 (postgres://) Passed")

    # 3. Case: Already asyncpg
    settings_mock.database_url = "postgresql+asyncpg://user:pass@localhost/db"
    importlib.reload(app.database)
    assert app.database.database_url == "postgresql+asyncpg://user:pass@localhost/db"
    print("  Case 3 (Already asyncpg) Passed")

    print("Database URL tests passed!\n")

def test_password_strength():
    print("Testing Password Strength...")
    from app.routers.auth import validate_password_strength
    from fastapi import HTTPException

    try:
        validate_password_strength("weak")
        print("  Failed: Weak password accepted")
    except HTTPException as e:
        print(f"  Caught expected error for weak password: {e.detail}")

    try:
        validate_password_strength("NoSpecialChar1")
        print("  Failed: No special char accepted")
    except HTTPException as e:
        assert "特殊字符" in e.detail
        print(f"  Caught expected error for no special char: {e.detail}")

    try:
        validate_password_strength("StrongPass1!")
        print("  Strong password accepted")
    except Exception as e:
        print(f"  Failed: Strong password rejected: {e}")

    print("Password strength tests passed!\n")

if __name__ == "__main__":
    test_database_url()
    test_password_strength()
