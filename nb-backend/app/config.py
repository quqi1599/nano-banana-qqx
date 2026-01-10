"""
配置管理模块
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """应用配置"""
    
    # 数据库
    database_url: str = "postgresql://postgres:postgres@localhost:5432/nbnb"
    redis_url: str = "redis://localhost:6379/0"
    
    # JWT
    jwt_secret_key: str = "your-super-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080  # 7 天
    
    # NewAPI
    newapi_base_url: str = "https://nanobanana2.peacedejiai.cc"
    
    # 积分配置
    credits_gemini_3_pro: int = 10
    credits_gemini_25_flash: int = 5
    credits_new_user_bonus: int = 0
    
    # 管理员
    admin_email: str = "admin@example.com"
    admin_password: str = "admin123"
    admin_notification_emails: str = ""  # 管理员通知邮箱，多个用逗号分隔
    
    # 阿里云邮件推送 (DirectMail SMTP)
    aliyun_smtp_host: str = "smtpdm.aliyun.com"
    aliyun_smtp_port: int = 465
    aliyun_smtp_user: str = ""  # 发信地址
    aliyun_smtp_password: str = ""  # SMTP密码
    aliyun_email_from_name: str = "DEAI"  # 发信人昵称
    aliyun_email_reply_to: str = ""  # 回信地址
    
    # 验证码配置
    email_code_expire_minutes: int = 10  # 验证码有效期
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()
