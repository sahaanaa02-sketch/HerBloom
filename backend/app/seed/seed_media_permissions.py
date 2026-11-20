
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.models.admin import (
    AdminPermission,
    AdminRole,
)


MEDIA_PERMISSIONS = [
    "media.view",
    "media.upload",
    "media.delete",
]


def seed_media_permissions():
    db = SessionLocal()

    try:
        super_admin = db.scalar(
            select(AdminRole)
            .options(selectinload(AdminRole.permissions))
            .where(AdminRole.name == "super_admin")
        )

        if super_admin is None:
            raise RuntimeError(
                "super_admin role not found. "
                "Run the existing Admin role setup first."
            )

        for key in MEDIA_PERMISSIONS:
            permission = db.scalar(
                select(AdminPermission)
                .where(AdminPermission.key == key)
            )

            if permission is None:
                permission = AdminPermission(key=key)
                db.add(permission)
                db.flush()
                print(f"Created: {key}")
            else:
                print(f"Already exists: {key}")

            if permission not in super_admin.permissions:
                super_admin.permissions.append(permission)
                print(f"Assigned to super_admin: {key}")

        db.commit()

        print("Media permissions setup completed!")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    seed_media_permissions()
