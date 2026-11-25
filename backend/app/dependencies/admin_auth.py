
from typing import Callable

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.admin import (
    AdminUser,
    AdminRole,
)
from app.services.admin_security import admin_session_version, admin_settings, require_admin_access


admin_bearer = HTTPBearer(
    scheme_name="AdminBearer",
    auto_error=False,
)


def get_current_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(
        admin_bearer
    ),
    db: Session = Depends(get_db),
) -> AdminUser:

    require_admin_access(request)
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            admin_settings.ADMIN_JWT_SECRET,
            algorithms=["HS256"],
            audience="admin",
            options={
                "require": [
                    "sub",
                    "aud",
                    "exp",
                    "iat",
                    "sv",
                ]
            },
        )

        if payload.get("purpose") != "admin_access":
            raise jwt.InvalidTokenError(
                "Invalid token purpose"
            )

        admin_id = int(payload["sub"])

    except (jwt.PyJWTError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Admin token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    admin = db.scalar(
        select(AdminUser)
        .options(
            selectinload(AdminUser.roles)
            .selectinload(AdminRole.permissions)
        )
        .where(AdminUser.id == admin_id)
    )

    if admin is None or not admin.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin account is unavailable",
        )

    if payload.get("sv", 0) != admin_session_version(db, admin.id):
        raise HTTPException(401, "Invalid or expired Admin token")

    if payload.get("amr") != ["pwd"]:
        raise HTTPException(401, "Invalid or expired Admin token", headers={"WWW-Authenticate": "Bearer"})

    return admin


def get_admin_permissions(admin: AdminUser) -> list[str]:
    permissions = set()

    for role in admin.roles:
        for permission in role.permissions:
            permissions.add(permission.key)

    return sorted(permissions)


def require_admin_permission(
    permission_key: str,
) -> Callable:

    def permission_checker(
        admin: AdminUser = Depends(get_current_admin),
    ) -> AdminUser:

        permissions = get_admin_permissions(admin)

        if permission_key not in permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You do not have permission "
                    "to perform this action"
                ),
            )

        return admin

    return permission_checker
