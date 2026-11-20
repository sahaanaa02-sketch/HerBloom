
import getpass
import re

from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.models.admin import AdminUser, AdminRole


password_hasher = PasswordHash.recommended()


def validate_email(email):
    pattern = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    return bool(re.fullmatch(pattern, email))


def validate_password(password):
    if len(password) < 12:
        return "Password must contain at least 12 characters."

    if len(password) > 128:
        return "Password must not exceed 128 characters."

    return None


def create_super_admin():
    print("\n" + "=" * 50)
    print("HerBloom - Create Super Admin")
    print("=" * 50)

    email = input("Admin email: ").strip().lower()
    name = input("Admin full name: ").strip()

    if not validate_email(email):
        print("Error: Invalid email address.")
        return

    if not name or len(name) > 150:
        print("Error: Name must be 1-150 characters.")
        return

    db = SessionLocal()

    try:
        existing_admin = db.scalar(
            select(AdminUser)
            .options(selectinload(AdminUser.roles))
            .where(AdminUser.email == email)
        )

        if existing_admin:
            print("\nAn Admin account with this email already exists.")
            print("No changes were made.")
            return

        super_admin_role = db.scalar(
            select(AdminRole).where(
                AdminRole.name == "super_admin"
            )
        )

        if super_admin_role is None:
            print("\nError: super_admin role not found.")
            print("Run seed_admin_roles.py first.")
            return

        password = getpass.getpass("Admin password: ")
        confirm_password = getpass.getpass(
            "Confirm admin password: "
        )

        error = validate_password(password)

        if error:
            print(f"\nError: {error}")
            return

        if password != confirm_password:
            print("\nError: Passwords do not match.")
            return

        hashed_password = password_hasher.hash(password)

        admin = AdminUser(
            email=email,
            name=name,
            password_hash=hashed_password,
            active=True,
            totp_enabled=False,
            failed_attempts=0,
        )

        admin.roles.append(super_admin_role)

        db.add(admin)
        db.commit()
        db.refresh(admin)

        print("\n" + "=" * 50)
        print("Super Admin created successfully!")
        print("=" * 50)
        print(f"Admin ID: {admin.id}")
        print(f"Name: {admin.name}")
        print(f"Email: {admin.email}")
        print("Role: super_admin")
        print("Status: Active")
        print("Two-factor authentication: Pending setup")
        print("\nPassword securely hashed and stored.")
        print("Next: Configure secure Admin Login and 2FA.")

    except Exception:
        db.rollback()
        print("\nError: Could not create Super Admin.")
        print("Database changes were rolled back.")
        raise

    finally:
        db.close()


if __name__ == "__main__":
    create_super_admin()
