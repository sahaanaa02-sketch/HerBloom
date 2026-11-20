import re

from sqlalchemy.exc import SQLAlchemyError

from app.config import E2E_DB_NAME, E2E_DB_USER, E2E_MODE, media_storage_dir
from app.database import engine
from app.e2e_schema import verify_schema

# MySQL escapes underscores in exact database grants when partial_revokes is off.
SCHEMA_GRANT = re.compile(r'GRANT ([A-Z, ]+) ON `herbloom\\_e2e\\_test`\.\* TO .+')
REQUIRED_PRIVILEGES = {"SELECT", "INSERT", "UPDATE", "DELETE"}
_launcher_authorized = False


def authorize_e2e_launcher():
    if not E2E_MODE:
        raise RuntimeError("This launcher requires the E2E profile.")
    global _launcher_authorized
    _launcher_authorized = True


def verify_database_identity(connection):
    database, account = connection.exec_driver_sql("SELECT DATABASE(), CURRENT_USER()").one()
    if (database, account) != (E2E_DB_NAME, E2E_DB_USER + "@localhost"):
        raise RuntimeError("The connected MySQL database or account is not the dedicated E2E identity.")

    privileges = set()
    for row in connection.exec_driver_sql("SHOW GRANTS"):
        statement = row[0]
        if statement.startswith("GRANT USAGE ON *.* TO ") and " WITH " not in statement:
            continue
        grant = SCHEMA_GRANT.fullmatch(statement)
        if grant is None or " WITH " in statement:
            raise RuntimeError("The E2E database account has an unexpected grant.")
        privileges.update(value.strip() for value in grant[1].split(","))
    if privileges != REQUIRED_PRIVILEGES:
        raise RuntimeError("The E2E database account must have only the expected schema-scoped CRUD grants.")


def preflight():
    if not E2E_MODE:
        raise RuntimeError("The E2E profile is required.")
    media_storage_dir()
    try:
        with engine.connect() as connection:
            verify_database_identity(connection)
            verify_schema(connection)
    except SQLAlchemyError:
        raise RuntimeError("Unable to connect to or verify the dedicated E2E database.") from None


def require_e2e_launcher():
    if not _launcher_authorized:
        raise RuntimeError("Start the E2E backend with python -m app.e2e serve.")


def verify_e2e_startup():
    require_e2e_launcher()
    preflight()
