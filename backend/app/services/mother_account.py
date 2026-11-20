import logging
import secrets
import smtplib
import ssl
from datetime import timedelta
from email.message import EmailMessage
from urllib.parse import urlsplit

from fastapi import HTTPException

from app.config import external_setting, settings
from app.database import SessionLocal
from app.services.auth_service import hash_password
from app.services.user_privacy import account_lock, active, consume_limit, now, rows, secret_hash, sql

log = logging.getLogger(__name__)


def outbound_email_enabled():
    return settings.A7_OUTBOUND_EMAIL_ENABLED is True


def require_outbound_email():
    if not outbound_email_enabled():
        raise HTTPException(503, "Account email sending is currently disabled.")


def delivery_link(purpose, token):
    origin = external_setting("ACCOUNT_EMAIL_FRONTEND_ORIGIN")
    if not origin:
        raise RuntimeError("Account email delivery is unavailable.")
    url = urlsplit(origin)
    loopback = url.hostname in ("127.0.0.1", "localhost")
    if (url.scheme != "https" and not (loopback and url.scheme == "http")) or not url.hostname or url.username or url.password or url.path not in ("", "/") or url.query or url.fragment:
        raise RuntimeError("An approved account email origin is required.")
    path = "reset-password" if purpose == "password_reset" else "verify-email"
    return origin.rstrip("/") + "/" + path + "#" + token


def send_account_email(email, purpose, token):
    require_outbound_email()
    host = external_setting("ACCOUNT_SMTP_HOST")
    sender = external_setting("ACCOUNT_SMTP_FROM")
    if not host or not sender:
        raise RuntimeError("Account email delivery is unavailable.")
    message = EmailMessage()
    message["From"] = sender
    message["To"] = email
    message["Subject"] = "HerBloom password reset" if purpose == "password_reset" else "Verify your HerBloom email"
    message.set_content("Open the one-time link below to complete your HerBloom account request." + chr(10)*2 + delivery_link(purpose, token))
    deliver_smtp(host, message)


def deliver_smtp(host, message):
    require_outbound_email()
    with smtplib.SMTP(host, int(external_setting("ACCOUNT_SMTP_PORT", "587")), timeout=7) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        username = external_setting("ACCOUNT_SMTP_USER")
        if username:
            smtp.login(username, external_setting("ACCOUNT_SMTP_PASSWORD", ""))
        smtp.send_message(message)


def issue_token(db, account, purpose):
    require_outbound_email()
    if not account["is_active"] or account["anonymized_at"] or (purpose == "verify_email" and account["email_verified_at"]):
        raise HTTPException(409, "This account action is unavailable.")
    token = secrets.token_urlsafe(32)
    stamp = now()
    sql(db, "UPDATE mother_account_tokens SET used_at=%s WHERE user_id=%s AND purpose=%s AND used_at IS NULL",
        (stamp, account["id"], purpose))
    sql(db, "INSERT INTO mother_account_tokens (user_id,purpose,token_hash,email_at_issue,expires_at) VALUES (%s,%s,%s,%s,%s)",
        (account["id"],purpose,secret_hash(token),account["email"],stamp+timedelta(minutes=30 if purpose == "password_reset" else 1440)))
    return token


def forgot_password(email):
    if not outbound_email_enabled():
        return
    # Run outside the public request-response path so transport latency cannot distinguish accounts.
    try:
        with SessionLocal() as db:
            account_id = sql(db, "SELECT id FROM users WHERE email=%s AND role='MOTHER'", (email,)).scalar_one_or_none()
            if account_id is None or not consume_limit(db, f"account-mail:{account_id}", 3, 60):
                return
            account = account_lock(db, account_id)
            token = issue_token(db, account, "password_reset")
            db.commit()
            send_account_email(account["email"], "password_reset", token)
    except Exception:
        log.info("Public reset delivery could not be completed.")


def use_token(db, token, purpose, password=None):
    hashed = secret_hash(token)
    key = sql(db, "SELECT user_id FROM mother_account_tokens WHERE token_hash=%s AND purpose=%s", (hashed,purpose)).scalar_one_or_none()
    error = HTTPException(400, "This link is invalid or has expired.")
    if key is None:
        raise error
    account = account_lock(db, key)
    matches = rows(db, "SELECT id,email_at_issue,expires_at,used_at FROM mother_account_tokens WHERE token_hash=%s AND purpose=%s FOR UPDATE",
                   (hashed,purpose))
    item = matches[0] if matches else None
    stamp = now()
    if not item or item["used_at"] or item["expires_at"] <= stamp or item["email_at_issue"] != account["email"] or not account["is_active"] or account["anonymized_at"]:
        raise error
    if purpose == "password_reset":
        sql(db, "UPDATE users SET hashed_password=%s,session_version=session_version+1 WHERE id=%s", (hash_password(password),key))
    else:
        sql(db, "UPDATE users SET email_verified_at=%s WHERE id=%s", (stamp,key))
    sql(db, "UPDATE mother_account_tokens SET used_at=%s WHERE id=%s",(stamp,item["id"]))
    db.commit()
