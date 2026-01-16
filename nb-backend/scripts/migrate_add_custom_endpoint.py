#!/usr/bin/env python3
"""
添加 custom_endpoint 列到 conversations 表的迁移脚本

运行方式:
  python scripts/migrate_add_custom_endpoint.py
"""

import asyncio
import sys
import os

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.database import get_db_session


async def migrate():
    """添加 custom_endpoint 列到 conversations 表"""
    async with get_db_session() as session:
        try:
            # 检查列是否已存在
            check_query = text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'conversations'
                AND column_name = 'custom_endpoint'
            """)
            result = await session.execute(check_query)
            exists = result.first() is not None

            if exists:
                print("✅ 列 'custom_endpoint' 已存在，跳过迁移")
                return

            # 添加列
            alter_query = text("""
                ALTER TABLE conversations
                ADD COLUMN custom_endpoint VARCHAR(500)
            """)
            await session.execute(alter_query)
            await session.commit()

            print("✅ 成功添加列 'custom_endpoint' 到 'conversations' 表")

        except Exception as e:
            await session.rollback()
            print(f"❌ 迁移失败: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(migrate())
