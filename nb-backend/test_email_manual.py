import sys
import os

# Add the current directory to sys.path so we can import app modules
sys.path.append(os.getcwd())

from app.services.email_service import send_email
from app.config import get_settings

def test_email():
    print("🚀 Starting email test...")
    
    try:
        settings = get_settings()
        print(f"Configuration:")
        print(f"- SMTP Host: {settings.aliyun_smtp_host}")
        print(f"- SMTP User: {settings.aliyun_smtp_user}")
        print(f"- Reply-To: {settings.aliyun_email_reply_to}")
        
        to_email = "1542452647@qq.com"  # Configuring to send to user's QQ
        print(f"\n📧 Sending test email to: {to_email}")
        
        subject = "【DEAI】邮件配置测试"
        html_content = """
        <div style="padding: 20px; background-color: #f0f9ff; border-radius: 10px;">
            <h2 style="color: #0369a1;">🎉 邮件发送成功！</h2>
            <p style="color: #334155;">恭喜您，您的 DEAI 系统邮件配置已生效。</p>
            <p><strong>发送时间：</strong>刚刚</p>
            <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;">
            <p style="font-size: 12px; color: #64748b;">此邮件由系统后端直接发送。</p>
        </div>
        """
        
        success = send_email(to_email, subject, html_content)
        
        if success:
            print("\n✅ 测试成功！邮件已发送。")
        else:
            print("\n❌ 测试失败！send_email 返回 False。")
            
    except Exception as e:
        print(f"\n❌ 发生异常: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_email()
