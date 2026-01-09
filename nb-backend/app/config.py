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
    credits_new_user_bonus: int = 50
    
    # 管理员
    admin_email: str = "admin@example.com"
    admin_password: str = "admin123"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()
