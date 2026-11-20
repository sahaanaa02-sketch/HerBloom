
from sqlalchemy import inspect

from app.database import Base, engine

# Import User model first to register the users table.
from app.models.user import User

# Import Recovery models.
from app.models.recovery import (
    RecoveryContext,
    SleepLog,
    WalkLog,
    BodyCheck,
    RecoveryExercise,
    ExerciseSession,
)


def create_recovery_tables():

    recovery_tables = [
        RecoveryContext.__table__,
        SleepLog.__table__,
        WalkLog.__table__,
        BodyCheck.__table__,
        RecoveryExercise.__table__,
        ExerciseSession.__table__,
    ]

    inspector = inspect(engine)

    existing_tables = set(
        inspector.get_table_names()
    )

    print("Checking Recovery database tables...")
    print()

    # Verify the parent users table exists.
    if "users" not in existing_tables:
        raise RuntimeError(
            "The users table does not exist in the database. "
            "Create the authentication tables first."
        )

    print("OK: users table exists")
    print()

    for table in recovery_tables:

        if table.name in existing_tables:
            print(f"Already exists: {table.name}")

        else:
            print(f"Missing: {table.name}")

    print()
    print("Creating missing Recovery tables...")

    Base.metadata.create_all(
        bind=engine,
        tables=recovery_tables,
        checkfirst=True,
    )

    print()
    print("Verifying Recovery tables...")

    inspector = inspect(engine)

    final_tables = set(
        inspector.get_table_names()
    )

    for table in recovery_tables:

        if table.name in final_tables:
            print(f"OK: {table.name}")

        else:
            print(f"FAILED: {table.name}")

    print()
    print("Recovery table setup completed.")


if __name__ == "__main__":
    create_recovery_tables()
