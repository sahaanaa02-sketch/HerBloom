
from datetime import date, datetime, timedelta, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
)
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.admin_overview import overview
from app.services import rate_limits
from app.models.admin import AdminUser, AuditLog

from app.services.admin_security import (
    verify_admin_password,
    create_admin_2fa_challenge,
    admin_session_version,
)

from app.dependencies.admin_auth import (
    get_current_admin,
    get_admin_permissions,
    require_admin_permission,
)


router = APIRouter(
    prefix="/api/admin",
    tags=["Admin"],
)


# ==========================================
# ADMIN LOGIN SCHEMA
# ==========================================

class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


# ==========================================
# ADMIN LOGIN
# ==========================================

@router.post("/auth/login")
def admin_login(
    data: AdminLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    rate_limits.enforce(db, "login:admin:" + rate_limits.source_ip(request), 30)
    email = str(data.email).strip().lower()

    now_naive = datetime.now(
        timezone.utc
    ).replace(tzinfo=None)

    admin = db.scalar(
        select(AdminUser).where(
            AdminUser.email == email
        ).with_for_update()
    )

    client_ip = (
        request.client.host
        if request.client
        else None
    )

    if admin is None or not admin.active:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    if (
        admin.locked_until is not None
        and admin.locked_until > now_naive
    ):
        raise HTTPException(
            status_code=429,
            detail="Account temporarily locked",
        )

    if (
        admin.locked_until is not None
        and admin.locked_until <= now_naive
    ):
        admin.locked_until = None
        admin.failed_attempts = 0

    password_valid = verify_admin_password(
        data.password,
        admin.password_hash,
    )

    if not password_valid:
        admin.failed_attempts += 1

        if admin.failed_attempts >= 5:
            admin.locked_until = (
                now_naive + timedelta(minutes=15)
            )

        db.add(
            AuditLog(
                admin_id=admin.id,
                action="admin.login.failed",
                entity="admin_auth",
                entity_id=str(admin.id),
                ip=client_ip,
            )
        )

        db.commit()

        if admin.locked_until is not None:
            raise HTTPException(
                status_code=429,
                detail="Account temporarily locked",
            )

        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    challenge_token = create_admin_2fa_challenge(
        admin.id, admin_session_version(db, admin.id)
    )

    db.add(
        AuditLog(
            admin_id=admin.id,
            action="admin.login.password_verified",
            entity="admin_auth",
            entity_id=str(admin.id),
            ip=client_ip,
        )
    )

    db.commit()

    return {
        "message": (
            "Password verified. "
            "Two-factor authentication required."
        ),
        "requires_2fa": True,
        "setup_required": not admin.totp_enabled,
        "challenge_token": challenge_token,
        "expires_in": 300,
    }


# ==========================================
# CURRENT ADMIN PROFILE
# ==========================================

@router.get("/me")
def get_admin_profile(
    admin: AdminUser = Depends(get_current_admin),
):
    return {
        "id": admin.id,
        "name": admin.name,
        "email": admin.email,
        "active": admin.active,
        "totp_enabled": admin.totp_enabled,
        "roles": [
            role.name
            for role in admin.roles
        ],
        "permissions": get_admin_permissions(admin),
    }


# ==========================================
# ADMIN DASHBOARD OVERVIEW
# ==========================================

@router.get("/overview")
def get_admin_overview(
    safety_date: date | None = None,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(require_admin_permission("overview.view")),
):
    return overview(db, admin, safety_date)
