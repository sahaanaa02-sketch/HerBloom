import hashlib
import hmac
import logging
import secrets
import smtplib
import ssl
from datetime import timedelta
from email.message import EmailMessage
from urllib.parse import urlsplit

from fastapi import HTTPException
from sqlalchemy import inspect

from app.config import E2E_MODE, external_setting, settings
from app.database import SessionLocal
from app.services.auth_service import hash_password
from app.services.user_privacy import account_lock, now, rows, secret_hash, sql

log = logging.getLogger(__name__)


def outbound_email_enabled():
    return settings.A7_OUTBOUND_EMAIL_ENABLED is True


def password_reset_email_enabled():
    return settings.MOTHER_PASSWORD_RESET_EMAIL_ENABLED is True or outbound_email_enabled()


def require_outbound_email(purpose=None):
    enabled = password_reset_email_enabled() if purpose == "password_reset" else outbound_email_enabled()
    if not enabled:
        raise HTTPException(503, "Account email sending is currently disabled.")


OTP_LIFETIME = timedelta(minutes=5)
RESET_GRANT_LIFETIME = timedelta(minutes=5)
RESEND_COOLDOWN = timedelta(seconds=60)


def delivery_link(purpose, token):
    if purpose != "verify_email":
        raise ValueError("Only email verification uses an email link.")
    origin = external_setting("ACCOUNT_EMAIL_FRONTEND_ORIGIN")
    if not origin:
        raise RuntimeError("Account email delivery is unavailable.")
    url = urlsplit(origin)
    loopback = url.hostname in ("127.0.0.1", "localhost")
    if (url.scheme != "https" and not (loopback and url.scheme == "http")) or not url.hostname or url.username or url.password or url.path not in ("", "/") or url.query or url.fragment:
        raise RuntimeError("An approved account email origin is required.")
    return origin.rstrip("/") + "/verify-email#" + token


def send_account_email(email, purpose, token):
    require_outbound_email(purpose)
    dedicated = purpose == "password_reset" and settings.MOTHER_PASSWORD_RESET_EMAIL_ENABLED
    host = settings.ACCOUNT_SMTP_HOST if dedicated else external_setting("ACCOUNT_SMTP_HOST")
    sender = settings.ACCOUNT_SMTP_FROM if dedicated else external_setting("ACCOUNT_SMTP_FROM")
    if not host or not sender:
        raise RuntimeError("Account email delivery is unavailable.")
    message = EmailMessage()
    message["From"] = sender
    message["To"] = email
    if purpose == "password_reset":
        message["Subject"] = "HerBloom | Password reset verification code"
        message.set_content(
            "HerBloom password reset\n\n"
            f"Your verification code is: {token}\n\n"
            "Enter this code on the HerBloom Forgot Password screen. "
            "It expires in 5 minutes. Do not share this code with anyone.\n\n"
            "If you did not request a password reset, you can ignore this email.\n"
            "The HerBloom team"
        )
    else:
        message["Subject"] = "Verify your HerBloom email"
        message.set_content("Open the one-time link below to complete your HerBloom account request.\n\n"
                            + delivery_link(purpose, token))
    deliver_smtp(host, message, purpose)


def deliver_smtp(host, message, purpose=None):
    require_outbound_email(purpose)
    dedicated = purpose == "password_reset" and settings.MOTHER_PASSWORD_RESET_EMAIL_ENABLED
    if dedicated and not reset_recipient_allowed(str(message["To"])):
        raise RuntimeError("Reset delivery is restricted to the isolated test recipient.")
    port = settings.ACCOUNT_SMTP_PORT if dedicated else int(external_setting("ACCOUNT_SMTP_PORT", "587"))
    username = settings.ACCOUNT_SMTP_USER if dedicated else external_setting("ACCOUNT_SMTP_USER")
    with smtplib.SMTP(host, port, timeout=7) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        if username:
            password = (settings.ACCOUNT_SMTP_PASSWORD.get_secret_value() if dedicated
                        else external_setting("ACCOUNT_SMTP_PASSWORD", ""))
            smtp.login(username, password)
        smtp.send_message(message)


def reset_recipient_allowed(email):
    return (not E2E_MODE or not settings.MOTHER_PASSWORD_RESET_EMAIL_ENABLED
            or email.casefold() == (settings.E2E_PASSWORD_RESET_TEST_RECIPIENT or "").casefold())


def google_only_account(db, user_id):
    if "google_subject" not in {column["name"] for column in inspect(db.connection()).get_columns("users")}:
        return False
    return sql(db, "SELECT google_subject IS NOT NULL FROM users WHERE id=%s", (user_id,)).scalar_one()


def reset_account_eligible(db, account):
    return (account["is_active"] and not account["anonymized_at"]
            and reset_recipient_allowed(account["email"])
            and not google_only_account(db, account["id"]))


def otp_digest(account, code, expires):
    # Non-hex prefixes distinguish OTPs and grants from legacy link hashes.
    material = f'password-reset-otp:{account["id"]}:{account["email"]}:{expires.isoformat()}:{code}'
    return "o" + hmac.new(settings.SECRET_KEY.encode(), material.encode(), hashlib.sha256).hexdigest()[:63]


def reset_grant_digest(token):
    return "r" + secret_hash("password-reset-grant:" + token)[:63]


def store_token(db, account, purpose, digest, expires):
    return sql(
        db, "INSERT INTO mother_account_tokens (user_id,purpose,token_hash,email_at_issue,expires_at) "
            "VALUES (%s,%s,%s,%s,%s)",
        (account["id"], purpose, digest, account["email"], expires),
    ).lastrowid


def invalidate_tokens(db, account_id, purpose, stamp):
    sql(db, "UPDATE mother_account_tokens SET used_at=%s WHERE user_id=%s AND purpose=%s AND used_at IS NULL",
        (stamp, account_id, purpose))


def issue_token(db, account, purpose):
    """Issue under the account row lock. Return the delivery value and its record ID."""
    require_outbound_email(purpose)
    stamp = now().replace(microsecond=0)
    if purpose == "password_reset":
        if not reset_account_eligible(db, account):
            raise HTTPException(409, "This account action is unavailable.")
        recent = rows(db, "SELECT token_hash,expires_at FROM mother_account_tokens "
                          "WHERE user_id=%s AND purpose='password_reset' AND SUBSTR(token_hash,1,1)='o' "
                          "AND expires_at>%s ORDER BY id DESC LIMIT 3 FOR UPDATE",
                      (account["id"], stamp - timedelta(hours=1) + OTP_LIFETIME))
        if len(recent) >= 3 or (recent and recent[0]["expires_at"] - OTP_LIFETIME + RESEND_COOLDOWN > stamp):
            raise HTTPException(429, "Too many requests. Try again later.")
        expires = stamp + OTP_LIFETIME
        while True:
            code = f"{secrets.randbelow(1_000_000):06d}"
            if not recent or otp_digest(account, code, recent[0]["expires_at"]) != recent[0]["token_hash"]:
                break
        invalidate_tokens(db, account["id"], purpose, stamp)
        return code, store_token(db, account, purpose, otp_digest(account, code, expires), expires)
    if not account["is_active"] or account["anonymized_at"] or account["email_verified_at"]:
        raise HTTPException(409, "This account action is unavailable.")
    token = secrets.token_urlsafe(32)
    invalidate_tokens(db, account["id"], purpose, stamp)
    return token, store_token(db, account, purpose, secret_hash(token), stamp + timedelta(days=1))


def invalidate_delivery(db, token_id):
    sql(db, "UPDATE mother_account_tokens SET used_at=%s WHERE id=%s AND used_at IS NULL", (now(), token_id))


def forgot_password(email):
    if not password_reset_email_enabled() or not reset_recipient_allowed(email):
        return
    # Delivery latency and account eligibility stay outside the public response.
    try:
        with SessionLocal() as db:
            account_id = sql(db, "SELECT id FROM users WHERE email=%s AND role='MOTHER'", (email,)).scalar_one_or_none()
            if account_id is None:
                return
            account = account_lock(db, account_id)
            if account["email"].casefold() != email.casefold():
                return
            code, token_id = issue_token(db, account, "password_reset")
            db.commit()
            try:
                send_account_email(account["email"], "password_reset", code)
            except Exception:
                log.warning("Password reset email delivery failed.")
                invalidate_delivery(db, token_id)
                db.commit()
    except HTTPException:
        return
    except Exception:
        log.warning("Public reset request could not be completed.")


def verify_reset_code(db, email, code):
    invalid = HTTPException(400, "Invalid verification code.")
    if not reset_recipient_allowed(email):
        raise invalid
    user_id = sql(db, "SELECT id FROM users WHERE email=%s AND role='MOTHER'", (email,)).scalar_one_or_none()
    if user_id is None:
        raise invalid
    account = account_lock(db, user_id)
    if account["email"].casefold() != email.casefold() or not reset_account_eligible(db, account):
        raise invalid
    items = rows(db, "SELECT id,token_hash,email_at_issue,expires_at,used_at FROM mother_account_tokens "
                     "WHERE user_id=%s AND purpose='password_reset' AND SUBSTR(token_hash,1,1)='o' "
                     "ORDER BY id DESC LIMIT 1 FOR UPDATE", (user_id,))
    item = items[0] if items else None
    if not item or item["used_at"] or item["email_at_issue"] != account["email"]:
        raise invalid
    matches = hmac.compare_digest(otp_digest(account, code, item["expires_at"]), item["token_hash"])
    stamp = now()
    if item["expires_at"] <= stamp:
        if matches:
            raise HTTPException(400, "Verification code expired.")
        raise invalid
    if not matches:
        # The account lock serializes verification and resend across workers.
        bucket = secret_hash(f'password-reset-attempts:{item["id"]}:{item["token_hash"]}')
        sql(db, "INSERT INTO a7_rate_limits (bucket,window_start,hits) VALUES (%s,%s,1) "
                "ON DUPLICATE KEY UPDATE hits=hits+1", (bucket, stamp))
        hits = sql(db, "SELECT hits FROM a7_rate_limits WHERE bucket=%s", (bucket,)).scalar_one()
        if hits >= 5:
            invalidate_delivery(db, item["id"])
        db.commit()
        raise invalid
    invalidate_delivery(db, item["id"])
    token = secrets.token_urlsafe(32)
    store_token(db, account, "password_reset", reset_grant_digest(token), stamp + RESET_GRANT_LIFETIME)
    db.commit()
    return token


def valid_token(db, token, purpose):
    hashed = reset_grant_digest(token) if purpose == "password_reset" else secret_hash(token)
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
    if purpose == "password_reset" and not reset_account_eligible(db, account):
        raise error
    return key, item, stamp


def use_token(db, token, purpose, password=None):
    key, item, stamp = valid_token(db, token, purpose)
    if purpose == "password_reset":
        sql(db, "UPDATE users SET hashed_password=%s,session_version=session_version+1 WHERE id=%s", (hash_password(password),key))
    else:
        sql(db, "UPDATE users SET email_verified_at=%s WHERE id=%s", (stamp,key))
    sql(db, "UPDATE mother_account_tokens SET used_at=%s WHERE id=%s",(stamp,item["id"]))
    db.commit()
