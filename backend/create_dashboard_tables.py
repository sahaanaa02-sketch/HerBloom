
from sqlalchemy import inspect

from app.database import engine, Base

# -----------------------------------
# IMPORT PARENT MODEL
# -----------------------------------

# Required for resolving users.id foreign keys
from app.models.user import User

# -----------------------------------
# IMPORT DASHBOARD MODELS
# -----------------------------------

from app.models.hydration import HydrationLog
from app.models.todo import DashboardTodo
from app.models.reminder import DashboardReminder


# -----------------------------------
# DASHBOARD TABLES ONLY
# -----------------------------------

dashboard_tables = [
    HydrationLog.__table__,
    DashboardTodo.__table__,
    DashboardReminder.__table__,
]


# -----------------------------------
# CREATE MISSING TABLES
# -----------------------------------

def main():
    inspector = inspect(engine)

    existing_tables = set(
        inspector.get_table_names()
    )

    # Verify that the existing users table is present
    if "users" not in existing_tables:
        print(
            "ERROR: users table does not exist "
            "in the connected database."
        )
        return

    # Verify that SQLAlchemy knows the parent model
    if "users" not in Base.metadata.tables:
        print(
            "ERROR: User model is not registered."
        )
        return

    for table in dashboard_tables:

        if table.name in existing_tables:
            print(
                f"Already exists: {table.name}"
            )
            continue

        print(
            f"Creating: {table.name}"
        )

        table.create(
            bind=engine,
            checkfirst=True,
        )

        print(
            f"Created: {table.name}"
        )

    print(
        "\nDashboard table setup finished."
    )


if __name__ == "__main__":
    main()
