from sqlalchemy import MetaData, Table, inspect, select

RESOURCES = {
    "warning-signs": "warning_signs",
    "red-flag-terms": "red_flag_terms",
    "messages": "safety_messages",
    "helplines": "helplines",
}


def safety_table(db, name):
    conn = db.connection()
    if not inspect(conn).has_table(name):
        return None
    return Table(name, MetaData(), autoload_with=conn, resolve_fks=False)


def published_rows(db, name, *order):
    table = safety_table(db, name)
    if table is None:
        return []
    where = [table.c.status == "published", table.c.reviewed_by.is_not(None),
             table.c.reviewed_at.is_not(None)]
    if "active" in table.c:
        where.append(table.c.active.is_(True))
    stmt = select(table).where(*where).order_by(*(table.c[k] for k in order), table.c.id)
    return list(db.execute(stmt).mappings())


def latest_messages(db):
    messages = {}
    for row in published_rows(db, "safety_messages", "version"):
        messages[row["message_key"]] = row
    return messages


def safety_message(db, key, lang, default):
    row = latest_messages(db).get(key)
    return row["body_" + lang] if row else default
