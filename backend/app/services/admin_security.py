
from datetime import datetime, timedelta, timezone

import jwt
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.config import E2E_MODE, ROOT_DIR, settings
from app.services.app_settings import ready


class AdminSecuritySettings(BaseSettings):
    ADMIN_JWT_SECRET: str
    ADMIN_TOKEN_MINUTES: int = 60

    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )


admin_settings = settings if E2E_MODE else AdminSecuritySettings()
if admin_settings.ADMIN_TOKEN_MINUTES != 60:
    raise RuntimeError("Admin access tokens must expire after 60 minutes.")
if settings.A14_HOSTED and (len(admin_settings.ADMIN_JWT_SECRET.strip()) < 32
                           or admin_settings.ADMIN_JWT_SECRET == settings.SECRET_KEY):
    raise RuntimeError("Hosted Admin authentication requires a separate strong signing key.")
password_hasher = PasswordHash.recommended()


def verify_admin_password(
    plain_password: str,
    password_hash: str,
) -> bool:
    try:
        return password_hasher.verify(
            plain_password,
            password_hash,
        )
    except Exception:
        return False


def password_only_admin_enabled() -> bool:
    return E2E_MODE and settings.E2E_ADMIN_PASSWORD_ONLY


def admin_session_version(db, admin_id: int, lock: bool = False) -> int:
    if not ready(db):
        return 0
    suffix = " FOR UPDATE" if lock else ""
    return db.connection().exec_driver_sql(
        "SELECT session_version FROM admin_users WHERE id=%s" + suffix, (admin_id,)
    ).scalar_one()


def create_admin_2fa_challenge(admin_id: int, session_version: int = 0) -> str:
    """
    Short-lived token for completing 2FA.
    This is NOT an authenticated Admin access token.
    """
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(admin_id),
        "sv": session_version,
        "aud": "admin-2fa",
        "purpose": "complete_2fa",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }

    return jwt.encode(
        payload,
        admin_settings.ADMIN_JWT_SECRET,
        algorithm="HS256",
    )


def verify_admin_2fa_challenge(token: str) -> tuple[int, int]:
    payload = jwt.decode(
        token,
        admin_settings.ADMIN_JWT_SECRET,
        algorithms=["HS256"],
        audience="admin-2fa",
        options={"require": ["sub", "aud", "exp", "iat"]},
    )

    if payload.get("purpose") != "complete_2fa":
        raise InvalidTokenError("Invalid token purpose")

    return int(payload["sub"]), payload.get("sv", 0)
