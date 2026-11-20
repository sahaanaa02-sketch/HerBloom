
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.admin import AdminRole, AdminPermission


PERMISSIONS = {
    "overview": [
        "overview.view",
    ],
    "content": [
        "content.view",
        "content.create",
        "content.edit",
        "content.delete",
        "content.publish",
    ],
    "nutrition": [
        "nutrition.view",
        "nutrition.create",
        "nutrition.edit",
        "nutrition.delete",
    ],
    "safety": [
        "safety.view",
        "safety.edit",
    ],
    "clinical": [
        "clinical.view",
        "clinical.review",
        "clinical.approve",
    ],
    "users": [
        "users.view",
        "users.manage",
    ],
    "settings": [
        "settings.view",
        "settings.manage",
    ],
    "ai": [
        "ai.view",
        "ai.manage",
    ],
    "notifications": [
        "notifications.view",
        "notifications.create",
        "notifications.send",
    ],
    "subscriptions": [
        "subscriptions.view",
        "subscriptions.manage",
    ],
    "analytics": [
        "analytics.view",
    ],
    "support": [
        "support.view",
        "support.reply",
        "support.manage",
    ],
    "staff": [
        "staff.view",
        "staff.manage",
    ],
    "audit": [
        "audit.view",
    ],
}


ROLE_PERMISSIONS = {
    "super_admin": [
        permission
        for group in PERMISSIONS.values()
        for permission in group
    ],

    "content_editor": [
        "overview.view",
        "content.view",
        "content.create",
        "content.edit",
        "content.publish",
        "nutrition.view",
        "nutrition.create",
        "nutrition.edit",
        "notifications.view",
        "notifications.create",
        "analytics.view",
    ],

    "clinical_reviewer": [
        "overview.view",
        "content.view",
        "clinical.view",
        "clinical.review",
        "clinical.approve",
        "safety.view",
        "safety.edit",
        "nutrition.view",
        "analytics.view",
    ],

    "support": [
        "overview.view",
        "users.view",
        "support.view",
        "support.reply",
    ],
}


def seed_permissions(db: Session):
    permission_objects = {}

    for group_permissions in PERMISSIONS.values():
        for permission_key in group_permissions:

            permission = db.scalar(
                select(AdminPermission).where(
                    AdminPermission.key == permission_key
                )
            )

            if permission is None:
                permission = AdminPermission(
                    key=permission_key
                )
                db.add(permission)
                db.flush()
                print(f"Created permission: {permission_key}")
            else:
                print(f"Exists: {permission_key}")

            permission_objects[permission_key] = permission

    return permission_objects


def seed_roles(db: Session, permission_objects):
    for role_name, allowed_permissions in ROLE_PERMISSIONS.items():

        role = db.scalar(
            select(AdminRole).where(
                AdminRole.name == role_name
            )
        )

        if role is None:
            role = AdminRole(name=role_name)
            db.add(role)
            db.flush()
            print(f"\nCreated role: {role_name}")
        else:
            print(f"\nExisting role: {role_name}")

        # Add missing permissions without removing existing assignments.
        existing_permission_keys = {
            permission.key for permission in role.permissions
        }

        for permission_key in allowed_permissions:
            if permission_key not in existing_permission_keys:
                role.permissions.append(
                    permission_objects[permission_key]
                )
                print(f"  Assigned: {permission_key}")


def main():
    db = SessionLocal()

    try:
        print("\nHerBloom Admin Roles and Permissions Setup")
        print("=" * 50)

        permission_objects = seed_permissions(db)

        seed_roles(db, permission_objects)

        db.commit()

        print("\n" + "=" * 50)
        print("Admin roles and permissions seeded successfully!")

        print(f"Total permission definitions: {len(permission_objects)}")
        print(f"Total role definitions: {len(ROLE_PERMISSIONS)}")

    except Exception as error:
        db.rollback()
        print(f"\nSeeding failed: {error}")
        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()
