"""
邮件发送服务 V2 - 支持多个邮件提供商
支持: 阿里云、腾讯云、通用 SMTP、SendGrid、Mailgun、Amazon SES
"""
import smtplib
import random
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any
import httpx

from app.config import get_settings

settings = get_settings()


# ============================================================================
# 预设提供商配置
# ============================================================================

PRESET_PROVIDERS = {
    "aliyun": {
        "name": "阿里云邮件推送",
        "smtp_host": "smtpdm.aliyun.com",
        "smtp_port": 465,
        "encryption": "ssl",
        "default_from": "noreply@",
    },
    "tencent": {
        "name": "腾讯云邮件推送",
        "smtp_host": "smtp.cloud.tencent.com",
        "smtp_port": 465,
        "encryption": "ssl",
        "default_from": "noreply@",
    },
    "sendgrid": {
        "name": "SendGrid",
        "api_url": "https://api.sendgrid.com/v3/mail/send",
        "default_from": "noreply@",
    },
    "mailgun": {
        "name": "Mailgun",
        "api_url": "https://api.mailgun.net/v3/",
        "default_from": "noreply@",
    },
    "ses": {
        "name": "Amazon SES",
        "smtp_host": "email-smtp.us-east-1.amazonaws.com",
        "smtp_port": 465,
        "encryption": "ssl",
        "default_from": "noreply@",
    },
}


def generate_code(length: int = 6) -> str:
    """生成数字验证码"""
    return ''.join(random.choices(string.digits, k=length))


# ============================================================================
# 邮件发送器基类
# ============================================================================

class EmailSender:
    """邮件发送器基类"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.smtp_host = config.get("smtp_host", "")
        self.smtp_port = config.get("smtp_port", 465)
        self.smtp_encryption = config.get("smtp_encryption", "ssl")
        self.smtp_user = config.get("smtp_user", "")
        self.smtp_password = config.get("smtp_password", "")
        self.from_email = config.get("from_email", self.smtp_user)
        self.from_name = config.get("from_name", "NanoBanana")
        self.reply_to = config.get("reply_to", "")
        self.api_key = config.get("api_key", "")
        self.api_url = config.get("api_url", "")

    def send(self, to_email: str, subject: str, html_content: str) -> bool:
        """发送邮件"""
        raise NotImplementedError


# ============================================================================
# SMTP 发送器
# ============================================================================

class SmtpSender(EmailSender):
    """SMTP 邮件发送器 - 支持标准 SMTP 协议"""

    def send(self, to_email: str, subject: str, html_content: str) -> bool:
        """通过 SMTP 发送邮件"""
        if not self.smtp_user or not self.smtp_password:
            print("⚠️ SMTP 配置不完整，跳过发送")
            return False

        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email

            if self.reply_to:
                msg['Reply-To'] = self.reply_to

            html_part = MIMEText(html_content, 'html', 'utf-8')
            msg.attach(html_part)

            # 根据端口判断加密方式
            use_ssl = self.smtp_port == 465 or self.smtp_encryption == "ssl"
            use_tls = self.smtp_encryption == "tls"

            if use_ssl:
                server = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port, timeout=20)
            else:
                server = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=20)
                if use_tls or self.smtp_port == 587:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()

            with server:
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, [to_email], msg.as_string())

            print(f"✅ 邮件发送成功: {to_email}")
            return True
        except Exception as e:
            print(f"❌ 邮件发送失败: {e}")
            return False


# ============================================================================
# SendGrid 发送器
# ============================================================================

class SendGridSender(EmailSender):
    """SendGrid API 发送器"""

    def send(self, to_email: str, subject: str, html_content: str) -> bool:
        """通过 SendGrid API 发送邮件"""
        if not self.api_key:
            print("⚠️ SendGrid API Key 未配置")
            return False

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    self.api_url or "https://api.sendgrid.com/v3/mail/send",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "personalizations": [{
                            "to": [{"email": to_email}],
                            "subject": subject,
                        }],
                        "from": {
                            "email": self.from_email,
                            "name": self.from_name,
                        },
                        "content": [{
                            "type": "text/html",
                            "value": html_content,
                        }],
                    },
                )
                if response.status_code in [202, 200]:
                    print(f"✅ SendGrid 邮件发送成功: {to_email}")
                    return True
                else:
                    print(f"❌ SendGrid 发送失败: {response.status_code} - {response.text}")
                    return False
        except Exception as e:
            print(f"❌ SendGrid 发送异常: {e}")
            return False


# ============================================================================
# Mailgun 发送器
# ============================================================================

class MailgunSender(EmailSender):
    """Mailgun API 发送器"""

    def send(self, to_email: str, subject: str, html_content: str) -> bool:
        """通过 Mailgun API 发送邮件"""
        if not self.api_key:
            print("⚠️ Mailgun API Key 未配置")
            return False

        try:
            # 从 api_url 中提取 domain
            domain = self.config.get("domain", "")
            base_url = self.api_url or "https://api.mailgun.net/v3/"

            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{base_url}{domain}/messages",
                    auth=("api", self.api_key),
                    data={
                        "from": f"{self.from_name} <{self.from_email}>",
                        "to": to_email,
                        "subject": subject,
                        "html": html_content,
                    },
                )
                if response.status_code in [200, 201]:
                    print(f"✅ Mailgun 邮件发送成功: {to_email}")
                    return True
                else:
                    print(f"❌ Mailgun 发送失败: {response.status_code} - {response.text}")
                    return False
        except Exception as e:
            print(f"❌ Mailgun 发送异常: {e}")
            return False


# ============================================================================
# 发送器工厂
# ============================================================================

SENDER_CLASSES = {
    "aliyun": SmtpSender,
    "tencent": SmtpSender,
    "smtp": SmtpSender,
    "ses": SmtpSender,
    "sendgrid": SendGridSender,
    "mailgun": MailgunSender,
}


def create_sender(config: Dict[str, Any]) -> EmailSender:
    """根据配置创建邮件发送器"""
    provider = config.get("provider", "smtp")
    sender_class = SENDER_CLASSES.get(provider, SmtpSender)
    return sender_class(config)


# ============================================================================
# 邮件模板组件（复用原有的模板函数）
# ============================================================================

def _email_wrapper(content: str) -> str:
    """邮件外层包装"""
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


def _tips_box(items: list) -> str:
    """提示框"""
    tips_html = "".join([f"""
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 12px;">
    <tr>
        <td style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #6b7280;">
            <span style="font-size: 16px; margin-right: 8px;">{item['icon']}</span>
            <span style="vertical-align: middle;">{item['text']}</span>
        </td>
    </tr>
</table>
""" for item in items])
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


# ============================================================================
# 统一发送接口
# ============================================================================

def get_smtp_config_from_db() -> Optional[Dict[str, Any]]:
    """从环境变量获取 SMTP 配置
    注意：当前版本使用环境变量配置，未来可扩展为从数据库读取
    """
    # 使用环境变量配置
    if settings.aliyun_smtp_user and settings.aliyun_smtp_password:
        return {
            "provider": "aliyun",
            "name": "环境变量配置",
            "smtp_host": settings.aliyun_smtp_host,
            "smtp_port": settings.aliyun_smtp_port,
            "smtp_encryption": "ssl",
            "smtp_user": settings.aliyun_smtp_user,
            "smtp_password": settings.aliyun_smtp_password,
            "from_email": settings.aliyun_smtp_user,
            "from_name": settings.aliyun_email_from_name,
            "reply_to": settings.aliyun_email_reply_to,
        }

    return None


def send_email_v2(to_email: str, subject: str, html_content: str) -> bool:
    """
    发送邮件 (V2 版本，支持多提供商)
    """
    config = get_smtp_config_from_db()
    if not config:
        print("⚠️ 邮件服务未配置，跳过发送")
        return False

    sender = create_sender(config)
    return sender.send(to_email, subject, html_content)


# ============================================================================
# 邮件模板函数
# ============================================================================

def send_verification_code_v2(to_email: str, code: str, purpose: str = "register") -> bool:
    """发送验证码邮件"""
    expire_minutes = settings.email_code_expire_minutes

    if purpose == "register":
        subject = "【NanoBanana】邮箱验证码"
        title = "验证您的邮箱地址"
        desc = "感谢您注册 NanoBanana！请使用以下验证码完成注册："
        icon = ""
        bg_color = "#f59e0b"
    else:
        return send_password_reset_code_v2(to_email, code)

    content = _header(icon, title, "从一句话开始的图像创作", bg_color)
    content += _content(f"""
<p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; color: #1f2937; margin-bottom: 8px; font-weight: 500;">您好，</p>
<p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #6b7280; margin-bottom: 16px;">{desc}</p>
{_code_box(code, "您的验证码", expire_minutes)}
{_tips_box([
    {"icon": "", "text": f"验证码有效期为 <strong>{expire_minutes} 分钟</strong>，请尽快使用"},
    {"icon": "", "text": "为了您的账户安全，请勿将验证码告知他人"},
    {"icon": "🚫", "text": "如果这不是您的操作，请忽略此邮件"}
])}
{_divider()}
{_footer("此邮件由系统自动发送，请勿直接回复<br/>如有疑问，请联系客服或在应用内提交工单")}
""")

    html = _email_wrapper(_container(content))
    return send_email_v2(to_email, subject, html)


def send_password_reset_code_v2(to_email: str, code: str) -> bool:
    """发送密码重置验证码邮件"""
    subject = "【NanoBanana】密码重置验证码"
    expire_minutes = settings.email_code_expire_minutes

    content = _header("🔐", "密码重置请求", "我们收到了您的密码重置请求", "#f59e0b")
    content += _content(f"""
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
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 16px 20px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #78350f;">验证码有效期为 <strong>{expire_minutes} 分钟</strong>，过期后需要重新获取</p>
        </td>
    </tr>
</table>
""")
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
    return send_email_v2(to_email, subject, html)


def send_test_email(to_email: str, provider_name: str) -> bool:
    """发送测试邮件"""
    subject = f"【NanoBanana】邮件配置测试 - {provider_name}"

    content = _header("📧", "邮件配置测试", f"测试 {provider_name} 邮件服务", "#10b981")
    content += _content(f"""
<p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #6b7280; margin-bottom: 16px;">
    如果您收到这封邮件，说明 <strong>{provider_name}</strong> 邮件服务配置成功！
</p>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0;">
    <tr>
        <td style="background-color: #ecfdf5; border-left: 4px solid #10b981; border-radius: 0 12px 12px 0; padding: 20px;">
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px; font-weight: 600; color: #065f46; margin-bottom: 8px;">配置信息</p>
            <p style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 20px; color: #047857;">
                提供商: {provider_name}<br>
                收件人: {to_email}<br>
                发送时间: {content[:10] if content else 'N/A'}
            </p>
        </td>
    </tr>
</table>
""")
    content += _footer("这是一封测试邮件，请勿回复")

    html = _email_wrapper(_container(content))
    return send_email_v2(to_email, subject, html)
