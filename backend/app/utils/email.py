import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


def send_password_reset_email(to_email: str, reset_link: str) -> None:
    message = MIMEMultipart("alternative")
    message["Subject"] = "Yêu cầu đặt lại mật khẩu"
    message["From"] = settings.smtp_sender
    message["To"] = to_email

    expire_minutes = settings.password_reset_token_expire_minutes

    text_body = (
        "Chào bạn,\n\n"
        f"Nhấn vào link sau để đặt lại mật khẩu (link hết hạn sau {expire_minutes} phút):\n"
        f"{reset_link}\n\n"
        "Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này."
    )

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px;">
        <p>Chào bạn,</p>
        <p>Nhấn vào nút bên dưới để đặt lại mật khẩu (link hết hạn sau {expire_minutes} phút):</p>
        <p>
            <a href="{reset_link}"
               style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">
               Đặt lại mật khẩu
            </a>
        </p>
        <p>Hoặc copy link sau vào trình duyệt:<br>{reset_link}</p>
        <p style="color:#666;font-size:12px;">
            Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
        </p>
    </div>
    """

    message.attach(MIMEText(text_body, "plain"))
    message.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_username, settings.smtp_password)
        server.sendmail(
            settings.smtp_sender,
            to_email,
            message.as_string(),
        )