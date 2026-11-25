
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException
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


def require_admin_access(request):
    if settings.A14_HOSTED or (not E2E_MODE and (
            settings.DB_NAME != "herbloom_db" or settings.DB_HOST not in ("localhost", "127.0.0.1", "::1"))):
        raise HTTPException(403, "Admin access is unavailable on this deployment.")
    if E2E_MODE:
        return
    loopback = {"127.0.0.1", "::1", "localhost"}
    if (request.client is None or request.client.host not in loopback
            or request.url.hostname not in loopback
            or request.headers.get("origin") not in (None, "http://localhost:5173", "http://127.0.0.1:5173")):
        raise HTTPException(403, "Local Admin sign-in requires a loopback connection.")


def admin_session_version(db, admin_id: int, lock: bool = False) -> int:
    if not ready(db):
        raise HTTPException(503, "Admin session revocation is unavailable.")
    suffix = " FOR UPDATE" if lock else ""
    return db.connection().exec_driver_sql(
        "SELECT session_version FROM admin_users WHERE id=%s" + suffix, (admin_id,)
    ).scalar_one()


def create_admin_access_token(admin_id: int, session_version: int = 0):
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(admin_id),
        "sv": session_version,
        "aud": "admin",
        "purpose": "admin_access",
        "amr": ["pwd"],
        "iat": now,
        "exp": now + timedelta(minutes=admin_settings.ADMIN_TOKEN_MINUTES),
    }
    return jwt.encode(claims, admin_settings.ADMIN_JWT_SECRET, algorithm="HS256")
