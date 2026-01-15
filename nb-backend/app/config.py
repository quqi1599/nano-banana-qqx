"""
配置管理模块
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List, Optional
from cryptography.fernet import Fernet


class Settings(BaseSettings):
    """应用配置"""

    # 运行环境
    environment: str = "development"
    log_level: str = "INFO"
    metrics_enabled: bool = True

    # CORS 配置（逗号分隔的允许域名列表）
    cors_origins_list: Optional[str] = None

    @property
    def cors_origins(self) -> List[str]:
        """获取 CORS 允许的域名列表"""
        if self.cors_origins_list:
            return [origin.strip() for origin in self.cors_origins_list.split(",")]
        # 默认允许本地开发
        return [
            "http://localhost",
            "http://localhost:80",
            "http://localhost:3000",
            "http://localhost:5173",
        ]
    
    # 数据库
    database_url: str = "postgresql://postgres:postgres@localhost:5432/nbnb"
    redis_url: str = "redis://localhost:6379/0"
    
    # JWT
    jwt_secret_key: str = "your-super-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 天

    # Token 安全
    token_encryption_key: str = ""  # Fernet key (base64, 32 bytes)
    token_failure_threshold: int = 3
    token_cooldown_seconds: int = 300
    token_disable_threshold: int = 10
    
    # NewAPI
    newapi_base_url: str = "https://nanobanana2.peacedejiai.cc"
    
    # 积分配置
    credits_gemini_3_pro: int = 10
    credits_gemini_25_flash: int = 5
    credits_new_user_bonus: int = 0
    
    # 管理员
    admin_email: str = "admin@example.com"
    admin_password: str = "admin123"
    admin_emails: str = ""  # 管理员邮箱列表，多个用逗号分隔（只有这些邮箱可以成为管理员）
    admin_notification_emails: str = ""  # 管理员通知邮箱，多个用逗号分隔
    admin_init_token: str = ""  # 管理员初始化令牌（推荐生产环境配置）
    admin_action_confirm_ttl_seconds: int = 300
    
    # 阿里云邮件推送 (DirectMail SMTP)
    aliyun_smtp_host: str = "smtpdm.aliyun.com"
    aliyun_smtp_port: int = 465
    aliyun_smtp_user: str = ""  # 发信地址
    aliyun_smtp_password: str = ""  # SMTP密码
    aliyun_email_from_name: str = "DEAI"  # 发信人昵称
    aliyun_email_reply_to: str = ""  # 回信地址
    
    # 验证码配置
    email_code_expire_minutes: int = 10  # 验证码有效期

    # 滑块验证码配置
    captcha_secret_key: str = "your-captcha-secret-key-change-in-production"
    captcha_challenge_ttl_seconds: int = 120
    captcha_ticket_ttl_seconds: int = 600
    captcha_challenge_max_attempts: int = 5

    # Sentry
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.0
    sentry_profiles_sample_rate: float = 0.0

    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    def validate_secrets(self) -> None:
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
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()
