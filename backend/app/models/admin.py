
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Table,
    Column,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# =========================================================
# ADMIN ROLE - PERMISSION ASSOCIATION TABLE
# =========================================================

admin_role_permissions = Table(
    "admin_role_permissions",
    Base.metadata,
    Column(
        "role_id",
        ForeignKey("admin_roles.id"),
        primary_key=True,
    ),
    Column(
        "permission_id",
        ForeignKey("admin_permissions.id"),
        primary_key=True,
    ),
)


# =========================================================
# ADMIN USER - ROLE ASSOCIATION TABLE
# =========================================================

admin_user_roles = Table(
    "admin_user_roles",
    Base.metadata,
    Column(
        "admin_id",
        ForeignKey("admin_users.id"),
        primary_key=True,
    ),
    Column(
        "role_id",
        ForeignKey("admin_roles.id"),
        primary_key=True,
    ),
)


# =========================================================
# ADMIN USER MODEL
# =========================================================

class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    # Admin account status
    active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    # Failed authentication attempts
    failed_attempts: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    # Temporary account lock
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    # Last successful login
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    # Assigned admin roles
    roles: Mapped[list["AdminRole"]] = relationship(
        secondary=admin_user_roles,
        back_populates="users",
    )


# =========================================================
# ADMIN ROLE MODEL
# =========================================================

class AdminRole(Base):
    __tablename__ = "admin_roles"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    name: Mapped[str] = mapped_column(
        String(80),
        unique=True,
        nullable=False,
    )

    permissions: Mapped[list["AdminPermission"]] = relationship(
        secondary=admin_role_permissions,
        back_populates="roles",
    )

    users: Mapped[list["AdminUser"]] = relationship(
        secondary=admin_user_roles,
        back_populates="roles",
    )


# =========================================================
# ADMIN PERMISSION MODEL
# =========================================================

class AdminPermission(Base):
    __tablename__ = "admin_permissions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    key: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
    )

    roles: Mapped[list["AdminRole"]] = relationship(
        secondary=admin_role_permissions,
        back_populates="permissions",
    )


# =========================================================
# ADMIN AUDIT LOG MODEL
# =========================================================

class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    admin_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey(
            "admin_users.id",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    action: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    entity: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    entity_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    before_json: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )

    after_json: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )

    ip: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )
