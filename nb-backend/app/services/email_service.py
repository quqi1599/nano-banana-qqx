"""
邮件发送服务 - 阿里云 DirectMail SMTP
"""
import smtplib
import random
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import get_settings


settings = get_settings()


def generate_code(length: int = 6) -> str:
    """生成数字验证码"""
    return ''.join(random.choices(string.digits, k=length))


def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """
    发送邮件 (同步方法，建议在后台任务中调用)
    """
    if not settings.aliyun_smtp_user or not settings.aliyun_smtp_password:
        print("⚠️ 邮件服务未配置，跳过发送")
        return False
    
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"{settings.aliyun_email_from_name} <{settings.aliyun_smtp_user}>"
        msg['To'] = to_email
        
        if settings.aliyun_email_reply_to:
            msg['Reply-To'] = settings.aliyun_email_reply_to
        
        html_part = MIMEText(html_content, 'html', 'utf-8')
        msg.attach(html_part)

        smtp_host = settings.aliyun_smtp_host
        smtp_port = settings.aliyun_smtp_port
        use_ssl = smtp_port == 465

        if use_ssl:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=20)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=20)
            server.ehlo()
            server.starttls()
            server.ehlo()

        with server:
            server.login(settings.aliyun_smtp_user, settings.aliyun_smtp_password)
            server.sendmail(settings.aliyun_smtp_user, [to_email], msg.as_string())
        
        print(f"✅ 邮件发送成功: {to_email}")
        return True
    except Exception as e:
        print(f"❌ 邮件发送失败: {e}")
        return False


def send_verification_code(to_email: str, code: str, purpose: str = "register") -> bool:
    """发送验证码邮件"""
    if purpose == "register":
        subject = "【DEAI】邮箱验证码"
        title = "验证您的邮箱地址"
        desc = "感谢您注册 DEAI！请使用以下验证码完成注册："
        theme_color = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
        bg_gradient = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
        logo_icon = "🎨"
    elif purpose == "reset":
        # 使用专门的密码重置邮件模板
        return send_password_reset_code(to_email, code)
    else:
        subject = "【DEAI】邮箱验证码"
        title = "邮箱验证"
        desc = "请使用以下验证码完成验证："
        theme_color = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
        bg_gradient = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
        logo_icon = "🎨"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: {bg_gradient}; padding: 40px 20px; line-height: 1.6; }}
            .container {{ max-width: 500px; margin: 0 auto; background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }}
            .header {{ background: {theme_color}; padding: 40px 30px; text-align: center; }}
            .logo {{ font-size: 16px; font-weight: 600; color: rgba(255,255,255,0.9); letter-spacing: 2px; margin-bottom: 8px; }}
            .logo-icon {{ font-size: 48px; margin-bottom: 16px; }}
            .header-title {{ font-size: 24px; font-weight: 700; color: white; margin-bottom: 8px; }}
            .header-subtitle {{ font-size: 14px; color: rgba(255,255,255,0.85); }}
            .content {{ padding: 40px 30px; }}
            .greeting {{ font-size: 16px; color: #1f2937; margin-bottom: 8px; font-weight: 500; }}
            .desc {{ color: #6b7280; font-size: 15px; margin-bottom: 24px; }}
            .code-box {{ background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 2px dashed #f59e0b; border-radius: 16px; padding: 24px; text-align: center; margin: 24px 0; }}
            .code-label {{ font-size: 12px; color: #d97706; font-weight: 600; letter-spacing: 1px; margin-bottom: 12px; text-transform: uppercase; }}
            .code {{ font-size: 42px; font-weight: 700; color: #1f2937; letter-spacing: 12px; font-family: 'Courier New', monospace; }}
            .bonus {{ background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 16px; margin: 20px 0; text-align: center; }}
            .bonus-icon {{ font-size: 20px; }}
            .bonus-text {{ font-size: 14px; color: #92400e; font-weight: 600; }}
            .tips {{ background: #f9fafb; border-radius: 12px; padding: 20px; margin: 24px 0; }}
            .tip-item {{ display: flex; align-items: flex-start; margin-bottom: 12px; font-size: 14px; color: #6b7280; }}
            .tip-item:last-child {{ margin-bottom: 0; }}
            .tip-icon {{ margin-right: 10px; font-size: 16px; }}
            .divider {{ height: 1px; background: #e5e7eb; margin: 24px 0; }}
            .footer {{ text-align: center; padding: 0 30px 30px; }}
            .footer-text {{ font-size: 12px; color: #9ca3af; line-height: 1.8; }}
            .footer-link {{ color: #d97706; text-decoration: none; }}
            .social-links {{ margin-top: 16px; }}
            .social-link {{ display: inline-block; width: 36px; height: 36px; line-height: 36px; background: #f3f4f6; border-radius: 50%; color: #6b7280; text-decoration: none; margin: 0 4px; font-size: 14px; }}
            .social-link:hover {{ background: #f59e0b; color: white; }}
            @media screen and (max-width: 600px) {{
                .container {{ border-radius: 16px; }}
                .header {{ padding: 30px 20px; }}
                .content {{ padding: 30px 20px; }}
                .code {{ font-size: 32px; letter-spacing: 6px; }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo-icon">{logo_icon}</div>
                <div class="logo">DEAI</div>
                <div class="header-title">{title}</div>
                <div class="header-subtitle">从一句话开始的图像创作</div>
            </div>
            <div class="content">
                <div class="greeting">您好，</div>
                <div class="desc">{desc}</div>

                <div class="code-box">
                    <div class="code-label">您的验证码</div>
                    <div class="code">{code}</div>
                </div>

                <div class="tips">
                    <div class="tip-item">
                        <span class="tip-icon">⏰</span>
                        <span>验证码有效期为 <strong>{settings.email_code_expire_minutes} 分钟</strong>，请尽快使用</span>
                    </div>
                    <div class="tip-item">
                        <span class="tip-icon">🔐</span>
                        <span>为了您的账户安全，请勿将验证码告知他人</span>
                    </div>
                    <div class="tip-item">
                        <span class="tip-icon">🚫</span>
                        <span>如果这不是您的操作，请忽略此邮件</span>
                    </div>
                </div>

                <div class="divider"></div>

                <div class="footer">
                    <div class="footer-text">
                        此邮件由系统自动发送，请勿直接回复<br>
                        如有疑问，请联系客服或在应用内提交工单
                    </div>
                    <div class="social-links">
                        <a href="#" class="social-link">🌐</a>
                        <a href="#" class="social-link">💬</a>
                        <a href="#" class="social-link">📧</a>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to_email, subject, html)


def send_password_reset_code(to_email: str, code: str) -> bool:
    """发送密码重置验证码邮件（专用模板）"""
    subject = "【DEAI】密码重置验证码"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); padding: 40px 20px; line-height: 1.6; }}
            .container {{ max-width: 500px; margin: 0 auto; background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }}
            .header {{ background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 30px; text-align: center; position: relative; overflow: hidden; }}
            .header::before {{ content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); animation: pulse 3s ease-in-out infinite; }}
            @keyframes pulse {{ 0%, 100% {{ transform: scale(1); }} 50% {{ transform: scale(1.05); }} }}
            .icon-wrapper {{ position: relative; z-index: 1; }}
            .icon {{ font-size: 56px; margin-bottom: 16px; }}
            .title {{ font-size: 24px; font-weight: 700; color: white; position: relative; z-index: 1; }}
            .subtitle {{ font-size: 14px; color: rgba(255,255,255,0.9); margin-top: 8px; position: relative; z-index: 1; }}
            .content {{ padding: 40px 30px; }}
            .alert-box {{ background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px 20px; margin: 24px 0; }}
            .alert-title {{ font-size: 14px; font-weight: 600; color: #92400e; margin-bottom: 6px; }}
            .alert-text {{ font-size: 13px; color: #78350f; line-height: 1.5; }}
            .code-section {{ text-align: center; margin: 32px 0; }}
            .code-label {{ font-size: 13px; color: #6b7280; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px; }}
            .code-box {{ background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 2px solid #f59e0b; border-radius: 16px; padding: 24px 32px; display: inline-block; min-width: 200px; }}
            .code {{ font-size: 40px; font-weight: 700; color: #92400e; letter-spacing: 10px; font-family: 'Courier New', monospace; }}
            .steps {{ margin: 24px 0; }}
            .step-title {{ font-size: 15px; font-weight: 600; color: #1f2937; margin-bottom: 12px; }}
            .step-item {{ display: flex; align-items: flex-start; margin-bottom: 12px; font-size: 14px; color: #4b5563; }}
            .step-num {{ flex-shrink: 0; width: 24px; height: 24px; background: #f59e0b; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; margin-right: 12px; }}
            .security-tip {{ background: #fee2e2; border-radius: 10px; padding: 16px; margin: 20px 0; text-align: center; }}
            .security-icon {{ font-size: 20px; margin-bottom: 8px; }}
            .security-text {{ font-size: 13px; color: #991b1b; }}
            .footer {{ text-align: center; padding: 24px 30px; background: #f9fafb; border-top: 1px solid #e5e7eb; }}
            .footer-text {{ font-size: 12px; color: #9ca3af; }}
            .help-link {{ color: #f59e0b; text-decoration: none; font-weight: 500; }}
            @media screen and (max-width: 600px) {{
                .container {{ border-radius: 16px; }}
                .header {{ padding: 32px 20px; }}
                .content {{ padding: 30px 20px; }}
                .code {{ font-size: 32px; letter-spacing: 6px; }}
                .code-box {{ padding: 20px 24px; min-width: auto; }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="icon-wrapper">
                    <div class="icon">🔐</div>
                </div>
                <div class="title">密码重置请求</div>
                <div class="subtitle">我们收到了您的密码重置请求</div>
            </div>
            <div class="content">
                <div class="alert-box">
                    <div class="alert-title">⚠️ 安全提醒</div>
                    <div class="alert-text">
                        如果这不是您本人的操作，请立即忽略此邮件并检查您的账户安全。
                    </div>
                </div>

                <div style="text-align: center; color: #4b5563; font-size: 14px; margin: 20px 0;">
                    请使用以下验证码重置您的密码：
                </div>

                <div class="code-section">
                    <div class="code-label">密码重置验证码</div>
                    <div class="code-box">
                        <div class="code">{code}</div>
                    </div>
                </div>

                <div class="steps">
                    <div class="step-title">重置步骤：</div>
                    <div class="step-item">
                        <div class="step-num">1</div>
                        <div>返回 DEAI 应用，在密码重置页面输入验证码</div>
                    </div>
                    <div class="step-item">
                        <div class="step-num">2</div>
                        <div>设置您的新密码（至少6位字符）</div>
                    </div>
                    <div class="step-item">
                        <div class="step-num">3</div>
                        <div>完成密码重置，使用新密码登录</div>
                    </div>
                </div>

                <div class="security-tip">
                    <div class="security-icon">⏰</div>
                    <div class="security-text">
                        验证码有效期为 <strong>{settings.email_code_expire_minutes} 分钟</strong>，过期后需要重新获取
                    </div>
                </div>

                <div class="security-tip" style="background: #f0f9ff;">
                    <div class="security-icon">🔒</div>
                    <div class="security-text" style="color: #1e40af;">
                        请勿将验证码透露给任何人，包括客服人员
                    </div>
                </div>
            </div>
            <div class="footer">
                <div class="footer-text">
                    此邮件由系统自动发送，请勿直接回复<br>
                    如有疑问，请联系 <a href="#" class="help-link">客服支持</a>
                </div>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to_email, subject, html)


def send_ticket_reply_notification(to_email: str, ticket_title: str, reply_content: str) -> bool:
    """发送工单回复通知（给用户）"""
    subject = f"【DEAI】您的工单有新回复"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; }}
            .container {{ max-width: 520px; margin: 0 auto; background: white; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.15); }}
            .header {{ background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 30px; text-align: center; }}
            .icon {{ font-size: 48px; margin-bottom: 12px; }}
            .title {{ font-size: 22px; font-weight: 700; color: white; }}
            .content {{ padding: 32px 30px; }}
            .ticket-info {{ background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px 20px; border-radius: 0 12px 12px 0; margin-bottom: 24px; }}
            .ticket-label {{ font-size: 12px; color: #059669; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; }}
            .ticket-title {{ font-size: 16px; font-weight: 600; color: #1f2937; }}
            .reply-box {{ background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0; }}
            .reply-header {{ display: flex; align-items: center; margin-bottom: 12px; }}
            .reply-badge {{ background: linear-gradient(135deg, #f59e0b, #d97706); color: white; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px; }}
            .reply-content {{ color: #374151; line-height: 1.7; white-space: pre-wrap; font-size: 15px; }}
            .button-box {{ text-align: center; margin: 24px 0; }}
            .button {{ display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 15px; }}
            .footer {{ text-align: center; padding: 0 30px 24px; }}
            .footer-text {{ font-size: 12px; color: #9ca3af; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="icon">💬</div>
                <div class="title">工单有新回复</div>
            </div>
            <div class="content">
                <div class="ticket-info">
                    <div class="ticket-label">工单标题</div>
                    <div class="ticket-title">{ticket_title}</div>
                </div>
                <div class="reply-box">
                    <div class="reply-header">
                        <span class="reply-badge">客服回复</span>
                    </div>
                    <div class="reply-content">{reply_content}</div>
                </div>
                <div class="button-box">
                    <a href="#" class="button">查看工单详情</a>
                </div>
                <div class="footer">
                    <div class="footer-text">如有其他问题，请直接在工单中继续回复</div>
                </div>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(to_email, subject, html)


def send_new_ticket_notification(
    to_emails: list,
    ticket_id: str,
    ticket_title: str,
    ticket_category: str,
    ticket_priority: str,
    user_email: str,
    content: str
) -> bool:
    """发送新工单通知（给管理员）"""
    priority_colors = {
        "low": "#10b981",
        "normal": "#f59e0b",
        "high": "#ef4444"
    }
    priority_labels = {
        "low": "低",
        "normal": "中",
        "high": "高"
    }
    priority_color = priority_colors.get(ticket_priority, "#6b7280")
    priority_label = priority_labels.get(ticket_priority, "中")

    subject = f"【DEAI工单】新工单待处理 - {ticket_title}"

    for email in to_emails:
        if not email.strip():
            continue

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * {{ margin: 0; padding: 0; box-sizing: border-box; }}
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 40px 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }}
                .header {{ background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 28px 30px; }}
                .header-title {{ font-size: 20px; font-weight: 700; color: white; }}
                .header-subtitle {{ font-size: 13px; color: rgba(255,255,255,0.85); margin-top: 4px; }}
                .content {{ padding: 28px 30px; }}
                .info-grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }}
                .info-item {{ background: #f9fafb; padding: 16px; border-radius: 10px; }}
                .info-label {{ font-size: 12px; color: #6b7280; margin-bottom: 4px; }}
                .info-value {{ font-size: 15px; font-weight: 600; color: #1f2937; }}
                .priority-badge {{ display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; color: white; }}
                .priority-low {{ background: #10b981; }}
                .priority-normal {{ background: #f59e0b; }}
                .priority-high {{ background: #ef4444; }}
                .message-box {{ background: #f9fafb; border-radius: 10px; padding: 20px; margin: 20px 0; }}
                .message-label {{ font-size: 12px; color: #6b7280; margin-bottom: 10px; font-weight: 600; }}
                .message-content {{ color: #374151; line-height: 1.6; white-space: pre-wrap; font-size: 14px; }}
                .button-box {{ text-align: center; margin: 24px 0; }}
                .button {{ display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; }}
                .footer {{ text-align: center; padding: 20px 30px; background: #f9fafb; font-size: 12px; color: #9ca3af; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-title">📋 新工单待处理</div>
                    <div class="header-subtitle">用户提交了新的支持请求</div>
                </div>
                <div class="content">
                    <div class="info-grid">
                        <div class="info-item">
                            <div class="info-label">工单编号</div>
                            <div class="info-value">#{ticket_id[:8]}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">优先级</div>
                            <div class="info-value"><span class="priority-badge priority-{ticket_priority}">{priority_label}</span></div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">分类</div>
                            <div class="info-value">{ticket_category}</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">提交用户</div>
                            <div class="info-value">{user_email}</div>
                        </div>
                    </div>
                    <div class="message-box">
                        <div class="message-label">工单标题</div>
                        <div class="info-value" style="margin-bottom: 16px;">{ticket_title}</div>
                        <div class="message-label">问题描述</div>
                        <div class="message-content">{content[:500]}{'...' if len(content) > 500 else ''}</div>
                    </div>
                    <div class="button-box">
                        <a href="#" class="button">立即处理</a>
                    </div>
                </div>
                <div class="footer">
                    请及时处理用户工单，提升用户体验
                </div>
            </div>
        </body>
        </html>
        """

        send_email(email.strip(), subject, html)

    return True


def send_ticket_user_reply_notification(
    to_emails: list,
    ticket_id: str,
    ticket_title: str,
    user_email: str,
    reply_content: str
) -> bool:
    """发送用户回复工单通知（给管理员）"""
    subject = f"【DEAI工单】用户回复了工单 - {ticket_title}"

    for email in to_emails:
        if not email.strip():
            continue

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * {{ margin: 0; padding: 0; box-sizing: border-box; }}
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 40px 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }}
                .header {{ background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 28px 30px; }}
                .header-title {{ font-size: 20px; font-weight: 700; color: white; }}
                .header-subtitle {{ font-size: 13px; color: rgba(255,255,255,0.85); margin-top: 4px; }}
                .content {{ padding: 28px 30px; }}
                .info-row {{ display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }}
                .info-item {{ flex: 1; }}
                .info-label {{ font-size: 12px; color: #6b7280; margin-bottom: 4px; }}
                .info-value {{ font-size: 15px; font-weight: 600; color: #1f2937; }}
                .message-box {{ background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 0 10px 10px 0; padding: 20px; margin: 20px 0; }}
                .message-label {{ font-size: 12px; color: #3b82f6; margin-bottom: 10px; font-weight: 600; }}
                .message-content {{ color: #1f2937; line-height: 1.6; white-space: pre-wrap; font-size: 14px; }}
                .button-box {{ text-align: center; margin: 24px 0; }}
                .button {{ display: inline-block; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="header-title">💬 用户有新回复</div>
                    <div class="header-subtitle">用户回复了之前的工单</div>
                </div>
                <div class="content">
                    <div class="info-row">
                        <div class="info-item">
                            <div class="info-label">工单编号</div>
                            <div class="info-value">#{ticket_id[:8]}</div>
                        </div>
                        <div class="info-item" style="text-align: right;">
                            <div class="info-label">回复用户</div>
                            <div class="info-value">{user_email}</div>
                        </div>
                    </div>
                    <div class="message-box">
                        <div class="message-label">工单标题：{ticket_title}</div>
                        <div class="message-content">{reply_content[:500]}{'...' if len(reply_content) > 500 else ''}</div>
                    </div>
                    <div class="button-box">
                        <a href="#" class="button">立即回复</a>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """

        send_email(email.strip(), subject, html)

    return True
