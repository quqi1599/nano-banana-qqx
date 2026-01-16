"""
配置管理模块
"""
import logging
from typing import List
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """应用配置"""
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )
    # 数据库
    database_url: str = "postgresql://postgres:postgres@localhost:5432/nbnb"
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # 环境
    environment: str = "development"
    log_level: str = "INFO"
    
    # CORS
    cors_origins_list: str = ""
    
    # JWT
    jwt_secret_key: str = "your-super-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    
    # Captcha
    captcha_secret_key: str = "your-captcha-secret-key-change-in-production"
    captcha_challenge_ttl_seconds: int = 300  # 5分钟
    captcha_challenge_max_attempts: int = 5
    captcha_ticket_ttl_seconds: int = 300  # 5分钟
    
    # Token encryption
    token_encryption_key: str = ""
    token_failure_threshold: int = 3
    token_disable_threshold: int = 5
    token_cooldown_seconds: int = 300
    
    # API keys
    openai_api_key: str = ""
    newapi_base_url: str = "https://api.openai.com"
    
    # Admin
    admin_email: str = ""
    admin_emails: str = ""
    admin_password: str = ""
    admin_notification_emails: str = ""
    admin_init_token: str = ""
    admin_action_confirm_ttl_seconds: int = 300

    # Auth security
    password_min_length: int = 8
    require_email_whitelist: bool = False
    email_whitelist_cache_ttl_seconds: int = 300
    jwt_blacklist_enabled: bool = True
    jwt_blacklist_fail_closed: bool = False
    login_fail_ip_limit: int = 50
    login_fail_ip_window_seconds: int = 3600

    # Auth cookies / CSRF
    auth_cookie_name: str = "nbnb_auth"
    auth_cookie_secure: bool = True
    auth_cookie_samesite: str = "lax"
    auth_cookie_domain: str = ""
    auth_cookie_path: str = "/"
    csrf_cookie_name: str = "nbnb_csrf"
    csrf_header_name: str = "X-CSRF-Token"
    csrf_cookie_secure: bool = True
    csrf_cookie_samesite: str = "lax"
    csrf_cookie_domain: str = ""
    csrf_cookie_path: str = "/"
    trust_proxy_headers: bool = False

    # API key user creation control
    api_key_user_creation_enabled: bool = False
    api_key_user_creation_limit_per_ip: int = 50
    api_key_user_creation_limit_window_seconds: int = 86400
    api_key_user_min_length: int = 20
    
    # Email
    aliyun_smtp_host: str = "smtpdm.aliyun.com"
    aliyun_smtp_port: int = 465
    aliyun_smtp_user: str = ""
    aliyun_smtp_password: str = ""
    aliyun_email_from_name: str = "DEAI"
    aliyun_email_reply_to: str = ""
    email_code_expire_minutes: int = 10
    
    # Sentry
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.1
    sentry_profiles_sample_rate: float = 0.1
    
    # Metrics
    metrics_enabled: bool = True

    # Celery / Queue
    celery_broker: str = ""  # 默认使用 redis_url
    celery_backend: str = ""  # 默认使用 redis_url
    celery_worker_concurrency: int = 4  # Worker 并发数

    # Flower 监控面板
    flower_enabled: bool = True
    flower_port: int = 5555
    flower_user: str = "admin"
    flower_password: str = "admin123"

    # Credits pricing defaults
    credits_gemini_3_pro: int = 10
    credits_gemini_25_flash: int = 1
    
    @property
    def cors_origins(self) -> List[str]:
        """解析 CORS 允许的来源"""
        if not self.cors_origins_list:
            return []
        return [origin.strip() for origin in self.cors_origins_list.split(",")]
    
    def is_production(self) -> bool:
        """是否生产环境"""
        return self.environment.lower() == "production"
    
    def is_development(self) -> bool:
        """是否开发环境"""
        return self.environment.lower() == "development"
    
    def validate_secrets(self) -> None:
        """
        验证生产环境必需的配置项
        """
        if not self.is_production():
            return

        problems: List[str] = []

        if not self.jwt_secret_key or self.jwt_secret_key == "your-super-secret-key-change-in-production" or len(self.jwt_secret_key) < 32:
            problems.append("JWT_SECRET_KEY 太弱或仍为默认值")
        if not self.captcha_secret_key or self.captcha_secret_key == "your-captcha-secret-key-change-in-production" or len(self.captcha_secret_key) < 32:
            problems.append("CAPTCHA_SECRET_KEY 太弱或仍为默认值")
        if not self.admin_password or self.admin_password == "admin123" or len(self.admin_password) < 12:
            problems.append("ADMIN_PASSWORD 太弱或仍为默认值")
        if not self.token_encryption_key:
            problems.append("TOKEN_ENCRYPTION_KEY 未配置")
        else:
            try:
                Fernet(self.token_encryption_key.encode())
            except Exception:
                problems.append("TOKEN_ENCRYPTION_KEY 格式无效")

        if problems:
            raise RuntimeError("生产环境配置不安全: " + "; ".join(problems))
    
@lru_cache()
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()
