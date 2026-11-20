
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.models.admin import AdminRole, AdminPermission


# Role permissions aligned with the HerBloom Admin Guide.
# Granular keys are retained for existing API compatibility.

ROLE_PERMISSIONS = {
    "super_admin": {
        "overview.view",
        "content.view",
        "content.create",
        "content.edit",
        "content.delete",
        "content.publish",
        "media.view",
        "media.upload",
        "media.delete",
        "nutrition.view",
        "nutrition.create",
        "nutrition.edit",
        "nutrition.delete",
        "safety.view",
        "safety.edit",
        "clinical.view",
        "clinical.review",
        "clinical.approve",
        "users.view",
        "users.manage",
        "settings.view",
        "settings.manage",
        "ai.view",
        "ai.manage",
        "notifications.view",
        "notifications.create",
        "notifications.send",
        "subscriptions.view",
        "subscriptions.manage",
        "analytics.view",
        "support.view",
        "support.reply",
        "support.manage",
        "staff.view",
        "staff.manage",
        "audit.view",
        "content.approve",
        "nutrition.approve",
        "safety.approve",
        "review.view",
        "data_requests.confirm",
        "notifications.manage",
        "billing.view",
        "billing.manage",
    },

    "content_editor": {
        "overview.view",
        "content.view",
        "content.create",
        "content.edit",
        "nutrition.view",
        "nutrition.create",
        "nutrition.edit",
        "safety.view",
        "safety.edit",
        "ai.view",
        "notifications.view",
        "notifications.create",
        "analytics.view",
    },

    "clinical_reviewer": {
        "overview.view",
        "content.view",
        "content.approve",
        "nutrition.view",
        "nutrition.approve",
        "safety.view",
        "safety.approve",
        "clinical.view",
        "clinical.review",
        "clinical.approve",
        "review.view",
        "ai.view",
        "notifications.view",
        "analytics.view",
    },

    "support": {
        "overview.view",
        "users.view",
        "users.manage",
        "support.view",
        "support.reply",
        "support.manage",
        "billing.view",
    },
}


def sync_admin_permissions():
    db = SessionLocal()

    try:
        roles = {
            role.name: role
            for role in db.scalars(
                select(AdminRole).options(
                    selectinload(AdminRole.permissions)
                )
            ).all()
        }

        missing_roles = set(ROLE_PERMISSIONS) - set(roles)

        if missing_roles:
            raise RuntimeError(
                f"Missing admin roles: {sorted(missing_roles)}"
            )

        all_keys = set().union(
            *ROLE_PERMISSIONS.values()
        )

        existing_permissions = {
            permission.key: permission
            for permission in db.scalars(
                select(AdminPermission)
            ).all()
        }

        for key in sorted(all_keys):
            if key not in existing_permissions:
                permission = AdminPermission(key=key)
                db.add(permission)
                existing_permissions[key] = permission

        db.flush()

        print("\nHerBloom Admin Permission Sync")
        print("-" * 45)

        for role_name, keys in ROLE_PERMISSIONS.items():
            role = roles[role_name]

            old_keys = {
                permission.key
                for permission in role.permissions
            }

            added = keys - old_keys
            removed = old_keys - keys

            print(f"\nRole: {role_name}")
            print(f"  Add: {sorted(added)}")
            print(f"  Remove: {sorted(removed)}")
            print(f"  Final count: {len(keys)}")

        print("\nNo changes have been committed yet.")

        confirmation = input(
            "\nType SYNC to apply these changes: "
        ).strip()

        if confirmation != "SYNC":
            db.rollback()
            print("Cancelled. Database unchanged.")
            return

        for role_name, keys in ROLE_PERMISSIONS.items():
            role = roles[role_name]
            role.permissions = [
                existing_permissions[key]
                for key in sorted(keys)
            ]

        db.commit()

        print("\nPermissions synchronized successfully!")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    sync_admin_permissions()
