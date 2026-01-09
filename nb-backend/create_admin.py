import asyncio
import os
import sys

# 添加项目根目录到 python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import AsyncSessionLocal, init_db
from app.models.user import User
from app.utils.security import get_password_hash

async def create_admin():
    print("正在初始化数据库...")
    await init_db()
    
    import argparse
    parser = argparse.ArgumentParser(description='Create Admin User')
    parser.add_argument('--email', help='Admin Email')
    parser.add_argument('--password', help='Admin Password')
    parser.add_argument('--nickname', default='Admin', help='Admin Nickname')
    args = parser.parse_args()

    if args.email and args.password:
        email = args.email
        password = args.password
        nickname = args.nickname
    else:
        email = input("请输入管理员邮箱: ").strip()
        password = input("请输入管理员密码: ").strip()
        nickname = input("请输入管理员昵称 (默认: Admin): ").strip() or "Admin"
    
    if not email or not password:
        print("错误: 邮箱和密码不能为空")
        return

    async with AsyncSessionLocal() as session:
        # 检查是否已存在
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.email == email))
        existing_user = result.scalars().first()
        
        if existing_user:
            print(f"用户 {email} 已存在。")
            if args.email: # 非交互模式自动升级
                if not existing_user.is_admin:
                    existing_user.is_admin = True
                    await session.commit()
                    print(f"用户 {email} 已自动升级为管理员。")
                else:
                    print("该用户已经是管理员。")
                return

            update = input("是否将其升级为管理员? (y/n): ").lower()
            if update == 'y':
                existing_user.is_admin = True
                await session.commit()
                print("升级成功！")
            return

        # 创建新用户
        new_user = User(
            email=email,
            password_hash=get_password_hash(password),
            nickname=nickname,
            is_admin=True,
            credit_balance=999999
        )
        session.add(new_user)
        await session.commit()
        print(f"管理员账号 {email} 创建成功！")

if __name__ == "__main__":
    try:
        asyncio.run(create_admin())
    except KeyboardInterrupt:
        print("\n操作已取消")
    except Exception as e:
        print(f"\n发生错误: {e}")
