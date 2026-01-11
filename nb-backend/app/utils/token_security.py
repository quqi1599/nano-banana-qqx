from hashlib import sha256
from typing import Optional, Tuple
from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

settings = get_settings()


def get_fernet() -> Optional[Fernet]:
    if not settings.token_encryption_key:
        return None
    try:
        return Fernet(settings.token_encryption_key.encode())
    except (TypeError, ValueError):
        return None


def hash_api_key(api_key: str) -> str:
    return sha256(api_key.encode()).hexdigest()


def is_encrypted(value: str) -> bool:
    return value.startswith("enc:")


def encrypt_api_key(api_key: str) -> str:
    fernet = get_fernet()
    if not fernet:
        return api_key
    token = fernet.encrypt(api_key.encode()).decode()
    return f"enc:{token}"


def decrypt_api_key(value: str) -> str:
    if not value:
        return ""
    if not is_encrypted(value):
        return value
    fernet = get_fernet()
    if not fernet:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is not configured")
    token = value[4:]
    try:
        return fernet.decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError("Failed to decrypt API key") from exc


def build_key_parts(api_key: str) -> Tuple[str, str]:
    if len(api_key) <= 4:
        return api_key, ""
    if len(api_key) <= 8:
        return api_key[:2], api_key[-2:]
    if len(api_key) <= 12:
        return api_key[:4], api_key[-2:]
    return api_key[:8], api_key[-4:]


def mask_key_parts(prefix: str, suffix: str) -> str:
    if not prefix and not suffix:
        return "***"
    if prefix and suffix:
        return f"{prefix}...{suffix}"
    if prefix:
        return f"{prefix}..."
    return f"...{suffix}"
