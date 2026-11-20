
import json

from app.config import e2e_home

# Each projection omits only instance-specific values such as index cardinality
# and the current auto-increment counter. FK schema names are relative to the target.
QUERIES = {
    "schema": """
        SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
        FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=DATABASE()
    """,
    "tables": """
        SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_COLLATION
        FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()
        ORDER BY TABLE_NAME
    """,
    "columns": """
        SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
               COLUMN_DEFAULT, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME, GENERATION_EXPRESSION
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    """,
    "indexes": """
        SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, NON_UNIQUE, COLUMN_NAME, COLLATION,
               SUB_PART, INDEX_TYPE, IS_VISIBLE, EXPRESSION, INDEX_COMMENT
        FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    """,
    "constraints": """
        SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE, ENFORCED
        FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
        ORDER BY TABLE_NAME, CONSTRAINT_NAME
    """,
    "foreign_keys": """
        SELECT TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION, COLUMN_NAME,
               CASE WHEN REFERENCED_TABLE_SCHEMA=DATABASE() THEN '<local>'
                    ELSE REFERENCED_TABLE_SCHEMA END,
               REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, POSITION_IN_UNIQUE_CONSTRAINT
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
    """,
    "referential_actions": """
        SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, UNIQUE_CONSTRAINT_NAME,
               MATCH_OPTION, UPDATE_RULE, DELETE_RULE
        FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
        ORDER BY TABLE_NAME, CONSTRAINT_NAME
    """,
    "checks": """
        SELECT t.TABLE_NAME,c.CONSTRAINT_NAME,c.CHECK_CLAUSE
        FROM information_schema.CHECK_CONSTRAINTS c JOIN information_schema.TABLE_CONSTRAINTS t
          ON t.CONSTRAINT_SCHEMA=c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME=c.CONSTRAINT_NAME
             AND t.CONSTRAINT_TYPE='CHECK'
        WHERE c.CONSTRAINT_SCHEMA=DATABASE() ORDER BY t.TABLE_NAME,c.CONSTRAINT_NAME
    """,
    "triggers": """
        SELECT EVENT_OBJECT_TABLE,TRIGGER_NAME,EVENT_MANIPULATION,ACTION_TIMING,ACTION_STATEMENT
        FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()
        ORDER BY EVENT_OBJECT_TABLE,TRIGGER_NAME
    """,
}


def schema_metadata(connection):
    return {key: [list(row) for row in connection.exec_driver_sql(sql)]
            for key, sql in QUERIES.items()}


def verify_schema(connection):
    path = e2e_home() / "schema-metadata.json"
    if path.resolve() != path:
        raise RuntimeError("E2E schema metadata must be a local baseline file.")
    try:
        expected = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise RuntimeError("The verified E2E schema metadata baseline is unavailable.") from None
    actual = schema_metadata(connection)
    if set(expected) != set(actual):
        raise RuntimeError("The E2E schema baseline has unexpected metadata sections.")
    differences = [key for key in actual if actual[key] != expected[key]]
    if differences:
        raise RuntimeError("E2E schema differs in: " + ", ".join(differences))
