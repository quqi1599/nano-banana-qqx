"""
邮件发送任务

支持异步发送：
- 验证码邮件
- 通知邮件
- 营销邮件
"""
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from app.celery_app import celery_app
from app.tasks.base import get_task_db, record_task_result

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.tasks.email_tasks.send_email_task",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def send_email_task(
    self,
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    category: str = "notification",
) -> Dict[str, Any]:
    """
    异步发送邮件任务

    Args:
        to_email: 收件人邮箱
        subject: 邮件主题
        html_content: HTML 邮件内容
        text_content: 纯文本邮件内容（fallback）
        category: 邮件分类

    Returns:
        任务结果字典
    """
    task_id = self.request.id
    start_time = datetime.now()

    logger.info(f"[{task_id}] 开始发送邮件: {to_email} - {subject}")

    try:
        from app.services.email_service import send_email

        result = send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )

        duration = (datetime.now() - start_time).total_seconds()

        return record_task_result(
            task_id=task_id,
            task_name="send_email",
            status="success",
            result={"to_email": to_email, "category": category},
            duration=duration,
        )

    except Exception as e:
        logger.error(f"[{task_id}] 邮件发送失败: {e}")

        # 记录失败
        duration = (datetime.now() - start_time).total_seconds()
        record_task_result(
            task_id=task_id,
            task_name="send_email",
            status="failed",
            error=str(e),
            duration=duration,
        )

        # 重试
        raise self.retry(exc=e)


@celery_app.task(
    name="app.tasks.email_tasks.send_verification_code_task",
    bind=True,
    max_retries=2,
)
def send_verification_code_task(
    self,
    to_email: str,
    code: str,
    expire_minutes: int = 10,
) -> Dict[str, Any]:
    """
    发送验证码邮件

    Args:
        to_email: 收件人邮箱
        code: 验证码
        expire_minutes: 过期时间（分钟）

    Returns:
        任务结果
    """
    from jinja2 import Template

    subject = "登录验证码 - NanoBanana"

    html_template = Template("""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">登录验证码</h2>
        <p>您的验证码是：</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            {{ code }}
        </div>
        <p>验证码有效期：{{ expire_minutes }} 分钟</p>
        <p style="color: #999; font-size: 12px;">请勿将验证码告知他人</p>
    </div>
    """)

    html_content = html_template.render(code=code, expire_minutes=expire_minutes)
    text_content = f"您的验证码是：{code}，有效期 {expire_minutes} 分钟。"

    # 调用邮件发送任务
    return send_email_task.delay(
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
        category="verification",
    )


@celery_app.task(
    name="app.tasks.email_tasks.send_batch_emails_task",
    bind=True,
)
def send_batch_emails_task(
    self,
    emails: list[Dict[str, str]],
    batch_size: int = 10,
) -> Dict[str, Any]:
    """
    批量发送邮件

    Args:
        emails: 邮件列表，每项包含 to_email, subject, html_content
        batch_size: 每批发送数量

    Returns:
        发送结果统计
    """
    task_id = self.request.id
    total = len(emails)
    success = 0
    failed = 0

    logger.info(f"[{task_id}] 开始批量发送 {total} 封邮件")

    for i, email_data in enumerate(emails):
        try:
            send_email_task.delay(
                to_email=email_data["to_email"],
                subject=email_data["subject"],
                html_content=email_data["html_content"],
                text_content=email_data.get("text_content"),
                category=email_data.get("category", "batch"),
            )
            success += 1
        except Exception as e:
            logger.error(f"邮件 {i+1} 发送失败: {e}")
            failed += 1

    return {
        "task_id": task_id,
        "total": total,
        "success": success,
        "failed": failed,
        "status": "completed",
    }


@celery_app.task(
    name="app.tasks.email_tasks.send_notification_task",
    bind=True,
    max_retries=2,
)
def send_notification_task(
    self,
    user_id: int,
    title: str,
    content: str,
    notification_type: str = "system",
) -> Dict[str, Any]:
    """
    发送通知邮件

    Args:
        user_id: 用户ID
        title: 通知标题
        content: 通知内容
        notification_type: 通知类型

    Returns:
        任务结果
    """
    from jinja2 import Template

    subject = f"{title} - NanoBanana"

    html_template = Template("""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">{{ title }}</h2>
        <div style="padding: 20px; background: #f9f9f9; border-radius: 5px; margin: 20px 0;">
            {{ content }}
        </div>
        <p style="color: #999; font-size: 12px;">这是一封系统通知邮件</p>
    </div>
    """)

    html_content = html_template.render(title=title, content=content)

    # 获取用户邮箱
    from app.tasks.base import get_task_db
    from sqlalchemy import select
    from app.models.user import User

    db = get_task_db()
    try:
        result = db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError(f"用户 {user_id} 不存在")

        to_email = user.email

        return send_email_task.delay(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=content,
            category="notification",
        )
    finally:
        db.close()
