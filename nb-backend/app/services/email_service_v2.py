"""
邮件发送服务 V2 - 支持多个邮件提供商
支持: 阿里云、腾讯云、通用 SMTP、SendGrid、Mailgun、Amazon SES
"""
import smtplib
import random
import string
import logging
import socket
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any
import httpx

from app.config import get_settings
from app.services.email_service import (
    _email_wrapper, _container, _header, _content,
    _code_box, _tips_box, _divider, _footer
)

settings = get_settings()
logger = logging.getLogger(__name__)


def _sanitize_log_input(email: str) -> str:
    """清理邮箱地址用于日志记录，防止日志注入"""
    if not email:
        return "(empty)"
    # 移除潜在的换行符和其他控制字符
    return ''.join(char for char in email if char.isprintable())[:100]


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

    def send(self, to_email: str, subject: str, html_content: str) -> Dict[str, Any]:
        """发送邮件，返回详细结果"""
        raise NotImplementedError


# ============================================================================
# SMTP 发送器
# ============================================================================

class SmtpSender(EmailSender):
    """SMTP 邮件发送器 - 支持标准 SMTP 协议"""

    def send(self, to_email: str, subject: str, html_content: str) -> Dict[str, Any]:
        """通过 SMTP 发送邮件，返回详细结果"""
        result = {
            "success": False,
            "message": "",
            "error_type": "",
            "details": {}
        }

        # 配置检查
        if not self.smtp_user:
            result["message"] = "SMTP 用户名未配置"
            result["error_type"] = "config_error"
            result["details"]["missing_field"] = "smtp_user"
            return result

        if not self.smtp_password:
            result["message"] = "SMTP 密码未配置"
            result["error_type"] = "config_error"
            result["details"]["missing_field"] = "smtp_password"
            return result

        if not self.smtp_host:
            result["message"] = "SMTP 服务器地址未配置"
            result["error_type"] = "config_error"
            result["details"]["missing_field"] = "smtp_host"
            return result

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

            connection_info = {
                "host": self.smtp_host,
                "port": self.smtp_port,
                "encryption": "SSL/TLS" if use_ssl else ("STARTTLS" if use_tls else "None"),
                "from": self.from_email,
                "to": to_email
            }

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

            logger.info("SMTP email sent successfully to %s", _sanitize_log_input(to_email))
            result["success"] = True
            result["message"] = "邮件发送成功"
            result["details"] = {
                "connection": connection_info,
                "provider": self._detect_provider(),
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            return result

        except smtplib.SMTPAuthenticationError as e:
            logger.error("SMTP auth failed to %s: %s", _sanitize_log_input(to_email), str(e))
            result["message"] = "SMTP 认证失败：用户名或密码错误"
            result["error_type"] = "authentication_error"
            result["details"]["hint"] = "请检查 SMTP 用户名和密码是否正确（阿里云需使用 SMTP 密码，非邮箱密码）"
            return result

        except smtplib.SMTPConnectError as e:
            logger.error("SMTP connect failed to %s: %s", _sanitize_log_input(to_email), str(e))
            result["message"] = f"无法连接到 SMTP 服务器 {self.smtp_host}:{self.smtp_port}"
            result["error_type"] = "connection_error"
            result["details"]["hint"] = "请检查服务器地址和端口是否正确，网络是否正常"
            return result

        except smtplib.SMTPException as e:
            logger.error("SMTP error to %s: %s", _sanitize_log_input(to_email), str(e))
            result["message"] = f"SMTP 错误: {str(e)}"
            result["error_type"] = "smtp_error"
            return result

        except TimeoutError as e:
            logger.error("SMTP timeout to %s", _sanitize_log_input(to_email))
            result["message"] = "连接超时，请检查网络或稍后重试"
            result["error_type"] = "timeout_error"
            result["details"]["hint"] = "可能是网络延迟或服务器响应过慢"
            return result

        except socket.gaierror as e:
            logger.error("DNS resolution failed for %s: %s", self.smtp_host, str(e))
            result["message"] = f"DNS 解析失败: 无法解析服务器地址 '{self.smtp_host}'"
            result["error_type"] = "dns_error"
            result["details"]["smtp_host"] = self.smtp_host
            result["details"]["hint"] = (
                f"请检查 SMTP 服务器地址是否正确拼写。<br>"
                f"常见正确地址：<br>"
                f"- 阿里云: smtpdm.aliyun.com<br>"
                f"- 腾讯云: smtp.cloud.tencent.com<br>"
                f"- Gmail: smtp.gmail.com<br>"
                f"- QQ邮箱: smtp.qq.com<br>"
                f"- 163邮箱: smtp.163.com"
            )
            return result

        except Exception as e:
            logger.error("SMTP send failed to %s: %s", _sanitize_log_input(to_email), type(e).__name__)
            result["message"] = f"发送失败: {type(e).__name__}"
            result["error_type"] = "unknown_error"
            return result

    def _detect_provider(self) -> str:
        """根据 SMTP 地址检测邮件服务商"""
        host = self.smtp_host.lower()
        if "aliyun" in host or "dm.aliyun" in host:
            return "阿里云邮件推送"
        elif "tencent" in host or "smtp.qq" in host:
            return "腾讯云邮件推送"
        elif "sendgrid" in host:
            return "SendGrid"
        elif "amazon" in host or "aws" in host:
            return "Amazon SES"
        elif "smtp.gmail" in host:
            return "Gmail"
        elif "smtp.office" in host or "outlook" in host:
            return "Outlook"
        else:
            return "自定义 SMTP"


# ============================================================================
# SendGrid 发送器
# ============================================================================

class SendGridSender(EmailSender):
    """SendGrid API 发送器"""

    def send(self, to_email: str, subject: str, html_content: str) -> Dict[str, Any]:
        """通过 SendGrid API 发送邮件，返回详细结果"""
        result = {
            "success": False,
            "message": "",
            "error_type": "",
            "details": {}
        }

        if not self.api_key:
            result["message"] = "SendGrid API Key 未配置"
            result["error_type"] = "config_error"
            return result

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
                    logger.info("SendGrid email sent successfully to %s", _sanitize_log_input(to_email))
                    result["success"] = True
                    result["message"] = "邮件发送成功"
                    result["details"] = {
                        "provider": "SendGrid",
                        "status_code": response.status_code,
                        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                    return result
                else:
                    logger.error("SendGrid send failed to %s: status=%d", _sanitize_log_input(to_email), response.status_code)
                    result["message"] = f"SendGrid API 返回错误: HTTP {response.status_code}"
                    result["error_type"] = "api_error"
                    result["details"]["status_code"] = response.status_code
                    result["details"]["hint"] = "请检查 API Key 是否正确"
                    return result
        except httpx.TimeoutException:
            logger.error("SendGrid timeout for %s", _sanitize_log_input(to_email))
            result["message"] = "请求超时，请稍后重试"
            result["error_type"] = "timeout_error"
            return result
        except Exception as e:
            logger.error("SendGrid exception for %s: %s", _sanitize_log_input(to_email), type(e).__name__)
            result["message"] = f"发送失败: {type(e).__name__}"
            result["error_type"] = "unknown_error"
            return result


# ============================================================================
# Mailgun 发送器
# ============================================================================

class MailgunSender(EmailSender):
    """Mailgun API 发送器"""

    def send(self, to_email: str, subject: str, html_content: str) -> Dict[str, Any]:
        """通过 Mailgun API 发送邮件，返回详细结果"""
        result = {
            "success": False,
            "message": "",
            "error_type": "",
            "details": {}
        }

        if not self.api_key:
            result["message"] = "Mailgun API Key 未配置"
            result["error_type"] = "config_error"
            return result

        domain = self.config.get("domain", "")
        if not domain:
            result["message"] = "Mailgun 域名未配置"
            result["error_type"] = "config_error"
            result["details"]["missing_field"] = "domain"
            return result

        try:
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
                    logger.info("Mailgun email sent successfully to %s", _sanitize_log_input(to_email))
                    result["success"] = True
                    result["message"] = "邮件发送成功"
                    result["details"] = {
                        "provider": "Mailgun",
                        "domain": domain,
                        "status_code": response.status_code,
                        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                    return result
                else:
                    logger.error("Mailgun send failed to %s: status=%d", _sanitize_log_input(to_email), response.status_code)
                    result["message"] = f"Mailgun API 返回错误: HTTP {response.status_code}"
                    result["error_type"] = "api_error"
                    result["details"]["status_code"] = response.status_code
                    return result
        except httpx.TimeoutException:
            logger.error("Mailgun timeout for %s", _sanitize_log_input(to_email))
            result["message"] = "请求超时，请稍后重试"
            result["error_type"] = "timeout_error"
            return result
        except Exception as e:
            logger.error("Mailgun exception for %s: %s", _sanitize_log_input(to_email), type(e).__name__)
            result["message"] = f"发送失败: {type(e).__name__}"
            result["error_type"] = "unknown_error"
            return result


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
# 统一发送接口
# ============================================================================

async def get_smtp_config_from_db() -> Optional[Dict[str, Any]]:
    """从数据库或环境变量获取 SMTP 配置
    优先使用数据库配置，如果不存在则回退到环境变量
    """
    from sqlalchemy import select, desc
    from app.database import get_db_session
    from app.models.smtp_config import SmtpConfig

    # 尝试从数据库读取默认配置
    async with get_db_session() as db:
        try:
            result = await db.execute(
                select(SmtpConfig)
                .where(SmtpConfig.is_enabled == True)
                .order_by(desc(SmtpConfig.is_default), desc(SmtpConfig.created_at))
                .limit(1)
            )
            config = result.scalar_one_or_none()

            if config:
                return {
                    "provider": config.provider,
                    "name": config.name,
                    "smtp_host": config.smtp_host,
                    "smtp_port": config.smtp_port,
                    "smtp_encryption": config.smtp_encryption,
                    "smtp_user": config.smtp_user,
                    "smtp_password": config.smtp_password,
                    "from_email": config.from_email or config.smtp_user,
                    "from_name": config.from_name,
                    "reply_to": config.reply_to,
                    "api_key": config.api_key,
                    "api_url": config.api_url,
                }
        except Exception as e:
            logger.warning("Failed to read SMTP config from database: %s", e)

    # 回退到环境变量配置
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


async def send_email_v2(to_email: str, subject: str, html_content: str) -> Dict[str, Any]:
    """
    发送邮件 (V2 版本，支持多提供商，从数据库读取配置)
    返回详细结果字典
    """
    sanitized_email = _sanitize_log_input(to_email)
    logger.info(f"[邮件] 准备发送邮件: 收件人={sanitized_email}, 主题={subject}")

    config = await get_smtp_config_from_db()
    if not config:
        logger.error(f"[邮件] 邮件服务未配置: 收件人={sanitized_email}")
        return {
            "success": False,
            "message": "邮件服务未配置",
            "error_type": "config_error"
        }

    provider = config.get("provider", "unknown")
    provider_name = config.get("name", provider)
    logger.info(f"[邮件] 使用邮件提供商: 提供商={provider_name}({provider}), 收件人={sanitized_email}")

    sender = create_sender(config)
    result = sender.send(to_email, subject, html_content)

    if result.get("success"):
        logger.info(f"[邮件] 发送成功: 收件人={sanitized_email}, 提供商={provider_name}")
    else:
        logger.error(f"[邮件] 发送失败: 收件人={sanitized_email}, 提供商={provider_name}, 错误={result.get('message', 'unknown')}, 错误类型={result.get('error_type', 'unknown')}")

    return result


# ============================================================================
# 邮件模板函数
# ============================================================================

async def send_verification_code_v2(to_email: str, code: str, purpose: str = "register") -> bool:
    """发送验证码邮件 (从数据库读取 SMTP 配置)"""
    expire_minutes = settings.email_code_expire_minutes

    if purpose == "register":
        subject = "【NanoBanana】邮箱验证码"
        title = "验证您的邮箱地址"
        desc = "感谢您注册 NanoBanana！请使用以下验证码完成注册："
        icon = ""
        bg_color = "#f59e0b"
    else:
        result = await send_password_reset_code_v2(to_email, code)
        return result.get("success", False) if isinstance(result, dict) else result

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
    result = await send_email_v2(to_email, subject, html)
    return result.get("success", False) if isinstance(result, dict) else result


async def send_password_reset_code_v2(to_email: str, code: str) -> bool:
    """发送密码重置验证码邮件 (从数据库读取 SMTP 配置)"""
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
    result = await send_email_v2(to_email, subject, html)
    return result.get("success", False) if isinstance(result, dict) else result


def send_test_email(to_email: str, provider_name: str) -> Dict[str, Any]:
    """发送测试邮件，返回详细结果"""
    subject = f"【NanoBanana】邮件配置测试 - {provider_name}"
    send_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

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
                发送时间: {send_time}
            </p>
        </td>
    </tr>
</table>
""")
    content += _footer("这是一封测试邮件，请勿回复")

    html = _email_wrapper(_container(content))
    return send_email_v2(to_email, subject, html)
