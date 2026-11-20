
from sqlalchemy import inspect

from app.database import Base, engine

# Register Admin models with SQLAlchemy metadata
import app.models.admin  # noqa: F401


ADMIN_TABLES = [
    "admin_users",
    "admin_roles",
    "admin_permissions",
    "admin_role_permissions",
    "admin_user_roles",
    "audit_log",
]


def create_admin_tables():
    print("\nHerBloom Admin Database Setup")
    print("-" * 40)

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table_name in ADMIN_TABLES:
        if table_name in existing_tables:
            print(f"Already exists: {table_name}")

    # Create only the Admin tables defined in this list.
    # Existing tables are not dropped or modified.
    tables = [
        Base.metadata.tables[name]
        for name in ADMIN_TABLES
    ]

    Base.metadata.create_all(
        bind=engine,
        tables=tables,
        checkfirst=True,
    )

    inspector = inspect(engine)
    created_tables = set(inspector.get_table_names())

    print("\nVerification:")

    for table_name in ADMIN_TABLES:
        if table_name in created_tables:
            print(f"OK: {table_name}")
        else:
            print(f"MISSING: {table_name}")

    print("\nAdmin database setup completed.")


if __name__ == "__main__":
    create_admin_tables()
