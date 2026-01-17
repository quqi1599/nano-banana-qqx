"""
邮件发送服务 - 阿里云 DirectMail SMTP
优化兼容性：QQ邮箱、126邮箱、Gmail、Outlook、iCloud、手机端
"""
import smtplib
import random
import string
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import get_settings


settings = get_settings()
logger = logging.getLogger(__name__)


def generate_code(length: int = 6) -> str:
    """生成数字验证码"""
    return ''.join(random.choices(string.digits, k=length))


def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """
    发送邮件 (同步方法，建议在后台任务中调用)
    """
    if not settings.aliyun_smtp_user or not settings.aliyun_smtp_password:
        logger.warning("Email service not configured, skipping send")
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

        logger.info("Email sent successfully to %s", _sanitize_log_input(to_email))
        return True
    except Exception as e:
        # 不记录完整的异常信息，避免泄露敏感配置（如密码）
        logger.error("Failed to send email to %s: %s", _sanitize_log_input(to_email), type(e).__name__)
        return False


def _sanitize_log_input(email: str) -> str:
    """清理邮箱地址用于日志记录，防止日志注入"""
    if not email:
        return "(empty)"
    # 移除潜在的换行符和其他控制字符
    return ''.join(char for char in email if char.isprintable())[:100]


# ============================================================================
# 通用邮件组件（内联样式，兼容各种邮件客户端）
# ============================================================================

def _email_wrapper(content: str) -> str:
    """邮件外层包装，提供兼容性更好的结构"""
    return f"""
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <meta name="x-apple-disable-message-reformatting" />
    <!--[if !mso]><!-->
    <style type="text/css">
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        table {{ border-collapse: collapse; table-layout: fixed; }}
        .gmail-hide {{ display: none; }}
    </style>
    <!--<![endif]-->
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style type="text/css">
        body {{ margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
        .external {{ display: block; width: 100%; }}
        .button {{ -webkit-text-size-adjust: none; mso-hide: all; }}
    </style>
</head>
<body style="margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: #f5f5f5;">
    <!--[if mso]>
    <style type="text/css">
        body, table, td {{font-family: Arial, sans-serif !important;}}
    </style>
    <![endif]-->
    {content}
</body>
</html>
"""


def _container(content: str, width: int = 500) -> str:
    """邮件容器"""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f5f5f5; padding: 20px;">
    <tr>
        <td align="center" style="padding: 20px 10px;">
            <table width="{width}" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
                <!--[if mso]>
                <table width="{width}" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 auto; background-color: #ffffff;">
                <tr><td style="padding: 0;">
                <![endif]-->
                {content}
                <!--[if mso]>
                </td></tr>
                </table>
                <![endif]-->
            </table>
        </td>
    </tr>
</table>
"""


def _header(icon: str, title: str, subtitle: str, bg_color: str = "#f59e0b") -> str:
    """邮件头部"""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: {bg_color};">
    <tr>
        <td align="center" style="padding: 36px 24px 32px;">
            <div style="font-size: 44px; line-height: 44px; margin-bottom: 12px;">{icon}</div>
            <h1 style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 24px; line-height: 32px; font-weight: 700; color: #ffffff; margin-bottom: 6px;">{title}</h1>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: rgba(255,255,255,0.9);">{subtitle}</p>
        </td>
    </tr>
</table>
<!--[if mso]>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: {bg_color};">
    <tr><td><div style="height: 0; font-size: 0; line-height: 0;">&nbsp;</div></td></tr>
</table>
<![endif]-->
"""


def _content(content: str) -> str:
    """内容区域"""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #ffffff;">
    <tr>
        <td style="padding: 32px 24px;">
            {content}
        </td>
    </tr>
</table>
"""


def _code_box(code: str, label: str = "您的验证码", expire_minutes: int = 10) -> str:
    """验证码展示框"""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td align="center" style="background-color: #fffbeb; border: 2px dashed #f59e0b; border-radius: 12px; padding: 24px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #d97706; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px;">{label}</p>
            <p style="margin: 0; padding: 0; font-family: 'Courier New', Courier, monospace; font-size: 36px; line-height: 44px; font-weight: 700; color: #1f2937; letter-spacing: 8px;">{code}</p>
        </td>
    </tr>
</table>
"""


def _tip_item(icon: str, text: str) -> str:
    """提示项"""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 12px;">
    <tr>
        <td style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #6b7280;">
            <span style="font-size: 16px; margin-right: 8px;">{icon}</span>
            <span style="vertical-align: middle;">{text}</span>
        </td>
    </tr>
</table>
"""


def _tips_box(items: list) -> str:
    """提示框"""
    tips_html = "".join([_tip_item(item["icon"], item["text"]) for item in items])
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td style="background-color: #f9fafb; border-radius: 12px; padding: 20px;">
            {tips_html}
        </td>
    </tr>
</table>
"""


def _divider() -> str:
    """分隔线"""
    return """
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td style="border-bottom: 1px solid #e5e7eb; font-size: 0; line-height: 0;">&nbsp;</td>
    </tr>
</table>
"""


def _footer(text: str) -> str:
    """页脚"""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 8px;">
    <tr>
        <td align="center" style="padding-bottom: 24px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #9ca3af;">{text}</p>
        </td>
    </tr>
</table>
"""


def _alert_box(title: str, text: str) -> str:
    """警告框"""
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 16px 20px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; font-weight: 600; color: #92400e; margin-bottom: 6px;">{title}</p>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 18px; color: #78350f;">{text}</p>
        </td>
    </tr>
</table>
"""


def _step_box(title: str, steps: list) -> str:
    """步骤框"""
    steps_html = ""
    for i, step in enumerate(steps, 1):
        steps_html += f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 14px;">
    <tr>
        <td style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #4b5563;">
            <span style="display: inline-block; width: 24px; height: 24px; background-color: #f59e0b; color: #ffffff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; margin-right: 12px; -webkit-text-size-adjust: none;">{i}</span>
            <span>{step}</span>
        </td>
    </tr>
</table>"""

    return f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 20px; font-weight: 600; color: #1f2937; margin-bottom: 16px;">{title}</p>
            {steps_html}
        </td>
    </tr>
</table>
"""


def _info_box(title: str, items: list, bg_color: str = "#fee2e2", text_color: str = "#991b1b", icon: str = "⏰") -> str:
    """信息框"""
    items_html = "".join([f"<p style=\"margin: 0 0 8px 0; padding: 0;\">{item}</p>" for item in items])
    return f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 16px 0;">
    <tr>
        <td align="center" style="background-color: {bg_color}; border-radius: 12px; padding: 16px;">
            <div style="font-size: 20px; margin-bottom: 8px;">{icon}</div>
            {items_html}
        </td>
    </tr>
</table>
"""


# ============================================================================
# 邮件模板函数
# ============================================================================

def send_verification_code(to_email: str, code: str, purpose: str = "register") -> bool:
    """发送验证码邮件"""
    if purpose == "register":
        subject = "【DEAI】邮箱验证码"
        title = "验证您的邮箱地址"
        desc = "感谢您注册 DEAI！请使用以下验证码完成注册："
        icon = "🎨"
        bg_color = "#f59e0b"
    else:
        return send_password_reset_code(to_email, code)

    # 构建邮件内容
    content = _header(icon, title, "从一句话开始的图像创作", bg_color)
    content += _content(f"""
<p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; color: #1f2937; margin-bottom: 8px; font-weight: 500;">您好，</p>
<p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #6b7280; margin-bottom: 16px;">{desc}</p>
{_code_box(code, "您的验证码", settings.email_code_expire_minutes)}
{_tips_box([
    {"icon": "⏰", "text": f"验证码有效期为 <strong>{settings.email_code_expire_minutes} 分钟</strong>，请尽快使用"},
    {"icon": "🔐", "text": "为了您的账户安全，请勿将验证码告知他人"},
    {"icon": "🚫", "text": "如果这不是您的操作，请忽略此邮件"}
])}
{_divider()}
{_footer("此邮件由系统自动发送，请勿直接回复<br/>如有疑问，请联系客服或在应用内提交工单")}
""")

    html = _email_wrapper(_container(content))
    return send_email(to_email, subject, html)


def send_password_reset_code(to_email: str, code: str) -> bool:
    """发送密码重置验证码邮件"""
    subject = "【DEAI】密码重置验证码"

    content = _header("🔐", "密码重置请求", "我们收到了您的密码重置请求", "#f59e0b")
    content += _content(f"""
{_alert_box("⚠️ 安全提醒", "如果这不是您本人的操作，请立即忽略此邮件并检查您的账户安全。")}
<p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #4b5563; text-align: center; margin: 20px 0;">请使用以下验证码重置您的密码：</p>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td align="center">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #6b7280; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 16px; text-align: center;">密码重置验证码</p>
            <table cellpadding="0" cellspacing="0" role="presentation" align="center" style="display: inline-block;">
                <tr>
                    <td style="background-color: #fffbeb; border: 2px solid #f59e0b; border-radius: 12px; padding: 20px 28px;">
                        <p style="margin: 0; padding: 0; font-family: 'Courier New', Courier, monospace; font-size: 36px; line-height: 44px; font-weight: 700; color: #92400e; letter-spacing: 8px;">{code}</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
{_step_box("重置步骤：", [
    "返回 DEAI 应用，在密码重置页面输入验证码",
    "设置您的新密码（至少6位字符）",
    "完成密码重置，使用新密码登录"
])}
{_info_box("", [f"验证码有效期为 <strong>{settings.email_code_expire_minutes} 分钟</strong>，过期后需要重新获取"], "#fee2e2", "#991b1b", "⏰")}
{_info_box("", ["请勿将验证码透露给任何人，包括客服人员"], "#f0f9ff", "#1e40af", "🔒")}
""")

    # 添加页脚
    content += """
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
    <tr>
        <td align="center" style="padding: 24px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #9ca3af;">此邮件由系统自动发送，请勿直接回复<br/>如有疑问，请联系客服支持</p>
        </td>
    </tr>
</table>
"""

    html = _email_wrapper(_container(content))
    return send_email(to_email, subject, html)


def send_ticket_reply_notification(to_email: str, ticket_title: str, reply_content: str) -> bool:
    """发送工单回复通知（给用户）"""
    subject = f"【DEAI】您的工单有新回复"

    content = _header("💬", "工单有新回复", "", "#10b981")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 24px;">
    <tr>
        <td style="background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 0 12px 12px 0; padding: 16px 20px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #059669; font-weight: 600; text-transform: uppercase; margin-bottom: 6px;">工单标题</p>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 22px; font-weight: 600; color: #1f2937;">{ticket_title}</p>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #f9fafb; border-radius: 12px; padding: 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td style="padding-bottom: 12px;">
                        <span style="display: inline-block; background-color: #f59e0b; color: #ffffff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 16px; font-weight: 600; padding: 4px 12px; border-radius: 20px;">客服回复</span>
                    </td>
                </tr>
                <tr>
                    <td style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #374151; white-space: pre-wrap;">{reply_content}</td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td align="center">
            <a href="#" style="display: inline-block; background-color: #f59e0b; color: #ffffff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 12px; -webkit-text-size-adjust: none;">查看工单详情</a>
        </td>
    </tr>
</table>
{_footer("如有其他问题，请直接在工单中继续回复")}
""")

    html = _email_wrapper(_container(content, width=520))
    return send_email(to_email, subject, html)


def send_new_ticket_notification(
    to_emails: list,
    ticket_id: str,
    ticket_title: str,
    ticket_category: str,
    ticket_priority: str,
    user_email: str,
    ticket_content: str,
    user_credits: int = 0,
    user_pro3: int = 0,
    user_flash: int = 0
) -> bool:
    """发送新工单通知（给管理员）"""
    priority_colors = {
        "low": ("#10b981", "低"),
        "normal": ("#f59e0b", "中"),
        "high": ("#ef4444", "高")
    }
    bg_color, label = priority_colors.get(ticket_priority, ("#6b7280", "中"))

    subject = f"【DEAI工单】新工单待处理 - {ticket_title}"

    content = _header("📋", "新工单待处理", "用户提交了新的支持请求")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 24px;">
    <tr>
        <td>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td width="48%" style="background-color: #f9fafb; padding: 16px; border-radius: 10px; vertical-align: top;">
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #6b7280; margin-bottom: 4px;">工单编号</p>
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 22px; font-weight: 600; color: #1f2937;">#{ticket_id[:8]}</p>
                    </td>
                    <td width="4%"></td>
                    <td width="48%" style="background-color: #f9fafb; padding: 16px; border-radius: 10px; vertical-align: top;">
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #6b7280; margin-bottom: 4px;">优先级</p>
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 22px; font-weight: 600; color: #1f2937;">
                            <span style="display: inline-block; background-color: {bg_color}; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 12px;">{label}</span>
                        </p>
                    </td>
                </tr>
                <tr>
                    <td height="16"></td>
                </tr>
                <tr>
                    <td width="48%" style="background-color: #f9fafb; padding: 16px; border-radius: 10px; vertical-align: top;">
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #6b7280; margin-bottom: 4px;">分类</p>
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 22px; font-weight: 600; color: #1f2937;">{ticket_category}</p>
                    </td>
                    <td width="4%"></td>
                    <td width="48%" style="background-color: #f9fafb; padding: 16px; border-radius: 10px; vertical-align: top;">
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #6b7280; margin-bottom: 4px;">提交用户</p>
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 22px; font-weight: 600; color: #1f2937;">{user_email}</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<!-- 用户积分信息 -->
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 20px;">
    <tr>
        <td style="background-color: #eff6ff; border-radius: 10px; padding: 16px;">
            <p style="margin: 0 0 10px 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #3b82f6; font-weight: 600;">用户积分余额</p>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                    <td width="33%" style="text-align: center;">
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #6b7280;">通用积分</p>
                        <p style="margin: 4px 0 0 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 700; color: #1f2937;">{user_credits}</p>
                    </td>
                    <td width="33%" style="text-align: center; border-left: 1px solid #dbeafe; border-right: 1px solid #dbeafe;">
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #6b7280;">Pro3 次数</p>
                        <p style="margin: 4px 0 0 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 700; color: #1f2937;">{user_pro3}</p>
                    </td>
                    <td width="33%" style="text-align: center;">
                        <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #6b7280;">Flash 次数</p>
                        <p style="margin: 4px 0 0 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 18px; font-weight: 700; color: #1f2937;">{user_flash}</p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #f9fafb; border-radius: 10px; padding: 20px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #6b7280; margin-bottom: 10px; font-weight: 600;">工单标题</p>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 22px; font-weight: 600; color: #1f2937; margin-bottom: 16px;">{ticket_title}</p>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #6b7280; margin-bottom: 10px; font-weight: 600;">问题描述</p>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #374151; white-space: pre-wrap;">{ticket_content[:500] if len(ticket_content) > 500 else ticket_content}{'...' if len(ticket_content) > 500 else ''}</p>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td align="center">
            <a href="#" style="display: inline-block; background-color: #f59e0b; color: #ffffff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 10px; -webkit-text-size-adjust: none;">立即处理</a>
        </td>
    </tr>
</table>
""")

    # 页脚
    content += """
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f9fafb;">
    <tr>
        <td align="center" style="padding: 20px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #9ca3af;">请及时处理用户工单，提升用户体验</p>
        </td>
    </tr>
</table>
"""

    html = _email_wrapper(_container(content, width=600))

    for email in to_emails:
        if email.strip():
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

    content = _header("💬", "用户有新回复", "用户回复了之前的工单", "#3b82f6")
    content += _content(f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
    <tr>
        <td width="50%" style="vertical-align: top;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #6b7280; margin-bottom: 4px;">工单编号</p>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 22px; font-weight: 600; color: #1f2937;">#{ticket_id[:8]}</p>
        </td>
        <td width="50%" style="vertical-align: top; text-align: right;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #6b7280; margin-bottom: 4px;">回复用户</p>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 22px; font-weight: 600; color: #1f2937;">{user_email}</p>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 20px 0;">
    <tr>
        <td style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 0 10px 10px 0; padding: 20px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 16px; color: #3b82f6; margin-bottom: 10px; font-weight: 600;">工单标题：{ticket_title}</p>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #1f2937; white-space: pre-wrap;">{reply_content[:500] if len(reply_content) > 500 else reply_content}{'...' if len(reply_content) > 500 else ''}</p>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td align="center">
            <a href="#" style="display: inline-block; background-color: #3b82f6; color: #ffffff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 10px; -webkit-text-size-adjust: none;">立即回复</a>
        </td>
    </tr>
</table>
""")

    html = _email_wrapper(_container(content, width=600))

    for email in to_emails:
        if email.strip():
            send_email(email.strip(), subject, html)
    return True
