
from datetime import datetime, timedelta, timezone

import jwt
import pyotp

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.admin import (
    AdminUser,
    AdminRole,
    AuditLog,
)
from app.services.admin_security import (
    admin_settings,
    verify_admin_2fa_challenge,
    admin_session_version,
)


router = APIRouter(
    prefix="/api/admin/auth",
    tags=["Admin Authentication"],
)


# =========================================================
# REQUEST SCHEMAS
# =========================================================

class ChallengeRequest(BaseModel):
    challenge_token: str


class VerifyRequest(BaseModel):
    challenge_token: str
    code: str = Field(pattern=r"^[0-9]{6}$")


# =========================================================
# HELPERS
# =========================================================

def utc_now_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_challenge_admin(
    token: str,
    db: Session,
    lock_row: bool = False,
):
    try:
        admin_id, version = verify_admin_2fa_challenge(token)
    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired login challenge",
        )

    query = (
        select(AdminUser)
        .options(
            selectinload(AdminUser.roles)
            .selectinload(AdminRole.permissions)
        )
        .where(AdminUser.id == admin_id)
    )

    if lock_row:
        query = query.with_for_update()

    admin = db.scalar(query)

    if admin is None or not admin.active or version != admin_session_version(db, admin.id, lock_row):
        raise HTTPException(
            status_code=401,
            detail="Invalid login challenge",
        )

    now = utc_now_naive()

    if admin.locked_until and admin.locked_until > now:
        raise HTTPException(
            status_code=429,
            detail="Account temporarily locked",
        )

    return admin


def get_permissions(admin: AdminUser):
    permissions = set()

    for role in admin.roles:
        for permission in role.permissions:
            permissions.add(permission.key)

    return sorted(permissions)


def create_admin_access_token(admin_id: int, session_version: int = 0):
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(admin_id),
        "sv": session_version,
        "aud": "admin",
        "purpose": "admin_access",
        "iat": now,
        "exp": now + timedelta(
            minutes=admin_settings.ADMIN_TOKEN_MINUTES
        ),
    }

    return jwt.encode(
        payload,
        admin_settings.ADMIN_JWT_SECRET,
        algorithm="HS256",
    )


def get_matching_totp_step(
    secret: str,
    code: str,
    now: datetime,
):
    """
    Return the time-step matching the supplied TOTP code.
    Accept the previous, current, or next 30-second step,
    consistent with valid_window=1.
    """
    totp = pyotp.TOTP(secret)

    current_step = int(
        now.timestamp() // totp.interval
    )

    for step in (
        current_step - 1,
        current_step,
        current_step + 1,
    ):
        if pyotp.utils.strings_equal(
            totp.at(step * totp.interval),
            code,
        ):
            return step

    return None


def add_auth_audit(
    db: Session,
    admin_id: int,
    action: str,
    request: Request,
):
    db.add(
        AuditLog(
            admin_id=admin_id,
            action=action,
            entity="admin_auth",
            entity_id=str(admin_id),
            ip=(
                request.client.host
                if request.client
                else None
            ),
        )
    )


# =========================================================
# SETUP GOOGLE AUTHENTICATOR
# =========================================================

@router.post("/2fa/setup")
def setup_admin_2fa(
    data: ChallengeRequest,
    db: Session = Depends(get_db),
):
    admin = get_challenge_admin(
        data.challenge_token,
        db,
        lock_row=True,
    )

    if admin.totp_enabled:
        raise HTTPException(
            status_code=400,
            detail="Two-factor authentication is already enabled",
        )

    if not admin.totp_secret:
        admin.totp_secret = pyotp.random_base32()
        db.commit()

    uri = pyotp.TOTP(
        admin.totp_secret
    ).provisioning_uri(
        name=admin.email,
        issuer_name="HerBloom Admin",
    )

    return {
        "message": "Add this account to your authenticator app",
        "otpauth_uri": uri,
        "setup_required": True,
    }


# =========================================================
# VERIFY GOOGLE AUTHENTICATOR OTP
# =========================================================

@router.post("/2fa/verify")
def verify_admin_2fa(
    data: VerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    # Lock the Admin row while verifying and recording OTP.
    # MySQL InnoDB prevents two requests from accepting
    # the same OTP concurrently.
    admin = get_challenge_admin(
        data.challenge_token,
        db,
        lock_row=True,
    )

    if not admin.totp_secret:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Set up two-factor authentication first",
        )

    now_aware = datetime.now(timezone.utc)

    matched_step = get_matching_totp_step(
        admin.totp_secret,
        data.code,
        now_aware,
    )

    # Reject invalid OTPs and previously used time-steps.
    replayed = (
        matched_step is not None
        and admin.last_totp_step is not None
        and matched_step <= admin.last_totp_step
    )

    if matched_step is None or replayed:
        admin.failed_attempts += 1

        locked = admin.failed_attempts >= 5

        if locked:
            admin.locked_until = (
                utc_now_naive()
                + timedelta(minutes=15)
            )

        add_auth_audit(
            db,
            admin.id,
            (
                "admin.2fa.replay_blocked"
                if replayed
                else "admin.2fa.failed"
            ),
            request,
        )

        db.commit()

        raise HTTPException(
            status_code=429 if locked else 401,
            detail=(
                "Account temporarily locked"
                if locked
                else "Invalid or already used authenticator code"
            ),
        )

    # Successful verification.
    first_time_setup = not admin.totp_enabled

    admin.last_totp_step = matched_step
    admin.totp_enabled = True
    admin.failed_attempts = 0
    admin.locked_until = None
    admin.last_login_at = utc_now_naive()

    if first_time_setup:
        add_auth_audit(
            db,
            admin.id,
            "admin.2fa.enabled",
            request,
        )

    add_auth_audit(
        db,
        admin.id,
        "admin.login.success",
        request,
    )

    version = admin_session_version(db, admin.id, lock=True)
    # Commit OTP usage before issuing the JWT.
    db.commit()

    access_token = create_admin_access_token(admin.id, version)

    return {
        "message": "Admin authentication successful",
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": (
            admin_settings.ADMIN_TOKEN_MINUTES * 60
        ),
        "admin": {
            "id": admin.id,
            "name": admin.name,
            "email": admin.email,
            "roles": [
                role.name for role in admin.roles
            ],
            "permissions": get_permissions(admin),
        },
    }
