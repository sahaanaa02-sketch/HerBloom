import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import urlsplit

from fastapi import HTTPException

from app.config import external_setting, settings


def delivery_enabled():
    return settings.A9_ADMIN_INVITES_ENABLED is True


def require_delivery():
    if not delivery_enabled():
        raise HTTPException(503, "Admin invitation delivery is currently disabled.")


def send_invitation(email, token):
    require_delivery()
    host = external_setting("ACCOUNT_SMTP_HOST")
    sender = external_setting("ACCOUNT_SMTP_FROM")
    origin = external_setting("ACCOUNT_EMAIL_FRONTEND_ORIGIN")
    if not host or not sender or not origin:
        raise RuntimeError("Admin invitation delivery is unavailable.")
    parsed = urlsplit(origin)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise RuntimeError("An HTTPS invitation origin is required.")
    message = EmailMessage()
    message["From"] = sender
    message["To"] = email
    message["Subject"] = "Set up your HerBloom administrator account"
    message.set_content("Open this one-time link within 48 hours to set your password and then sign in to HerBloom."
                        + chr(10)*2 + origin.rstrip("/") + "/admin/setup#" + token)
    require_delivery()
    with smtplib.SMTP(host, int(external_setting("ACCOUNT_SMTP_PORT", "587")), timeout=7) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        username = external_setting("ACCOUNT_SMTP_USER")
        if username:
            smtp.login(username, external_setting("ACCOUNT_SMTP_PASSWORD", ""))
        smtp.send_message(message)
