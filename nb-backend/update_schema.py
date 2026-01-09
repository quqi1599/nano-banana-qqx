import asyncio
import sys
import os
from sqlalchemy import text

# 添加项目根目录到 python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import engine

async def update_schema():
    async with engine.begin() as conn:
        print("Starting schema update...")
        
        # Update User table
        print("Updating users table...")
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45);"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS note TEXT;"))
        except Exception as e:
            print(f"Update users table warning (might already exist): {e}")

        # Create LoginHistory table
        print("Creating login_history table...")
        try:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS login_history (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    ip_address VARCHAR(45),
                    user_agent VARCHAR(500),
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """))
        except Exception as e:
             print(f"Create login_history table error: {e}")
        
        print("Schema update completed successfully!")

if __name__ == "__main__":
    asyncio.run(update_schema())
