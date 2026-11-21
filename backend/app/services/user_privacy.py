import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException
from sqlalchemy import JSON, inspect
from app.services.auth_service import hash_password

from app.config import E2E_MODE, ROOT_DIR, e2e_home, settings
from app.services.journal_crypto import decrypt_text

OWNED = (
    "activity_sessions", "body_checks", "chat_feedback", "chat_sessions",
    "dashboard_reminders", "dashboard_todos", "exercise_sessions", "favorite_foods",
    "food_logs", "hb_records", "hydration_logs", "journal_entries", "meal_plans",
    "mother_profiles", "recovery_contexts", "sleep_logs", "walk_logs", "weekly_reports",
    "wellbeing_checkins", "wellbeing_schedules",
)
CHILDREN = {"chat_messages": ("session_id", "chat_sessions"), "meal_plan_items": ("plan_id", "meal_plans")}
SCOPED = OWNED + tuple(CHILDREN)
FINANCIAL = ("billing_orders", "billing_payment_events")
ACCOUNT = "id, username, full_name, email, role, is_active, created_at, updated_at, last_active_at, email_verified_at"


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def secret_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


def active(db):
    return inspect(db.connection()).has_table("v_admin_users")


def readiness(db):
    if not active(db):
        raise HTTPException(503, "Users management is awaiting its database migration.")


def rows(db, query, params=()):
    return [dict(r) for r in db.connection().exec_driver_sql(query, params).mappings()]


def sql(db, query, params=()):
    return db.connection().exec_driver_sql(query, params)


def account_lock(db, user_id):
    found = rows(db, "SELECT id,email,is_active,anonymized_at,email_verified_at FROM users "
                 "WHERE id=%s AND role='MOTHER' FOR UPDATE", (user_id,))
    if not found:
        raise HTTPException(404, "Mother account not found.")
    return found[0]


def consume_limit(db, key, cap, minutes):
    bucket = hmac.new(settings.SECRET_KEY.encode(), key.encode(), hashlib.sha256).hexdigest()
    stamp = now()
    cutoff = stamp - timedelta(minutes=minutes)
    sql(db, "INSERT INTO a7_rate_limits (bucket,window_start,hits) VALUES (%s,%s,1) "
        "ON DUPLICATE KEY UPDATE hits=IF(window_start<=%s,1,hits+1),"
        "window_start=IF(window_start<=%s,%s,window_start)", (bucket,stamp,cutoff,cutoff,stamp))
    allowed = sql(db, "SELECT hits FROM a7_rate_limits WHERE bucket=%s", (bucket,)).scalar_one() <= cap
    db.commit()
    return allowed


def review_storage_present(db):
    return inspect(db.connection()).has_table("ai_feedback_reviews")


def scoped_tables(db):
    schema = inspect(db.connection())
    optional = ("food_log_saves", "ai_feedback_reviews", "free_ai_usage_events", "entitlement_periods", "weekly_insights", "mother_engagement", "support_tickets", "ticket_replies", *FINANCIAL)
    return SCOPED + tuple(table for table in optional if schema.has_table(table))


def criterion(table):
    if table == "ticket_replies":
        return "ticket_id IN (SELECT id FROM support_tickets WHERE user_id=%s)"
    if table == "billing_payment_events":
        return "order_id IN (SELECT id FROM billing_orders WHERE user_id=%s)"
    if table == "weekly_insights":
        return "entitlement_id IN (SELECT id FROM entitlement_periods WHERE user_id=%s)"
    if table == "ai_feedback_reviews":
        return "feedback_id IN (SELECT id FROM chat_feedback WHERE user_id=%s)"
    if table in CHILDREN:
        key, parent = CHILDREN[table]
        return f"`{key}` IN (SELECT id FROM `{parent}` WHERE user_id=%s)"
    return "user_id=%s"


def ownership_verified(db):
    # Refuse processing if ownership FKs change, including new children of owned rows.
    schema = inspect(db.connection())
    graph = set()
    parents = {"users", *scoped_tables(db)}
    for table in schema.get_table_names():
        for fk in schema.get_foreign_keys(table):
            if fk["referred_table"] in parents:
                graph.add((table, tuple(fk["constrained_columns"]), fk["referred_table"]))
    expected = {(t, ("user_id",), "users") for t in OWNED + ("data_requests", "mother_account_tokens")}
    if schema.has_table("food_log_saves"):
        expected.add(("food_log_saves", ("user_id",), "users"))
    if schema.has_table("free_ai_usage_events"):
        expected.add(("free_ai_usage_events", ("user_id",), "users"))
    if schema.has_table("entitlement_periods"):
        expected.add(("entitlement_periods", ("user_id",), "users"))
    if schema.has_table("weekly_insights"):
        expected.add(("weekly_insights", ("entitlement_id",), "entitlement_periods"))
    expected |= {(t, (key,), parent) for t, (key, parent) in CHILDREN.items()}
    expected |= {("chat_feedback", ("message_id",), "chat_messages"),
                 ("meal_plan_items", ("food_log_id",), "food_logs")}
    if schema.has_table("mother_engagement"):
        expected.add(("mother_engagement", ("user_id",), "users"))
    if schema.has_table("support_tickets"):
        expected.add(("support_tickets", ("user_id",), "users"))
    if schema.has_table("ticket_replies"):
        expected.add(("ticket_replies", ("ticket_id",), "support_tickets"))
    if schema.has_table("billing_orders"):
        expected.update({("billing_orders", ("user_id",), "users"),
                         ("billing_orders", ("entitlement_id",), "entitlement_periods")})
    if schema.has_table("billing_payment_events"):
        expected.add(("billing_payment_events", ("order_id",), "billing_orders"))
    if review_storage_present(db):
        expected.add(("ai_feedback_reviews", ("feedback_id",), "chat_feedback"))
    if "question_message_id" in {c["name"] for c in schema.get_columns("chat_messages")}:
        expected.add(("chat_messages", ("question_message_id",), "chat_messages"))
    if graph != expected:
        raise HTTPException(409, "The data ownership inventory requires review before processing this request.")


def verify_scope(db, uid):
    ownership_verified(db)
    mismatch = (
        "SELECT COUNT(*) FROM chat_feedback f JOIN chat_messages m ON m.id=f.message_id "
        "JOIN chat_sessions s ON s.id=m.session_id WHERE (s.user_id=%s OR f.user_id=%s) AND f.user_id<>s.user_id",
        "SELECT COUNT(*) FROM meal_plan_items i JOIN meal_plans p ON p.id=i.plan_id "
        "JOIN food_logs f ON f.id=i.food_log_id WHERE (p.user_id=%s OR f.user_id=%s) AND p.user_id<>f.user_id",
    )
    if "question_message_id" in {c["name"] for c in inspect(db.connection()).get_columns("chat_messages")}:
        mismatch += (
            "SELECT COUNT(*) FROM chat_messages a JOIN chat_messages q ON q.id=a.question_message_id "
            "JOIN chat_sessions x ON x.id=a.session_id JOIN chat_sessions y ON y.id=q.session_id "
            "WHERE (x.user_id=%s OR y.user_id=%s) AND (x.user_id<>y.user_id OR x.id<>y.id)",
        )
    if any(sql(db, query, (uid, uid)).scalar_one() for query in mismatch):
        raise HTTPException(409, "Unexpected cross-account relationships require review.")


def export_root():
    if E2E_MODE:
        root = e2e_home() / "exports"
    else:
        local = Path(os.environ["LOCALAPPDATA"]) if os.environ.get("LOCALAPPDATA") else Path.home() / ".local" / "share"
        root = local / "HerBloom" / "PrivateExports"
    if root.resolve() != root or root.is_relative_to(ROOT_DIR.resolve()):
        raise RuntimeError("Unsafe private export directory.")
    return root


def file_for(name):
    if not name or len(name) != 36 or not name.endswith(".zip") or any(c not in "0123456789abcdef" for c in name[:-4]):
        raise RuntimeError("Invalid private export filename.")
    path = export_root() / name
    if path.resolve() != path:
        raise RuntimeError("Unsafe export file.")
    return path


def exports_enabled():
    return settings.A7_EXPORTS_ENABLED is True


def require_exports():
    if not exports_enabled():
        raise HTTPException(503, "Data exports are currently disabled.")


def create_export(db, user_id):
    require_exports()
    verify_scope(db, user_id)
    name = secrets.token_hex(16) + ".zip"
    path = file_for(name)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
    try:
        with os.fdopen(fd, "wb") as stream, ZipFile(stream, "w", compression=ZIP_DEFLATED) as archive:
            def write(key, values):
                archive.writestr(key + ".json", json.dumps(values, ensure_ascii=False, default=str))
            write("account", rows(db, f"SELECT {ACCOUNT} FROM users WHERE id=%s", (user_id,))[0])
            schema = inspect(db.connection())
            for table in scoped_tables(db):
                projection = "feedback_id, share_content" if table == "ai_feedback_reviews" else "*"
                if table == "billing_orders":
                    projection = ("id, order_ref, amount_lkr, currency, status, review_required, "
                                  "provider_payment_id, created_at_utc, verified_at_utc")
                data = rows(db, f"SELECT {projection} FROM `{table}` WHERE {criterion(table)}", (user_id,))
                fields = [c["name"] for c in schema.get_columns(table) if isinstance(c["type"], JSON)]
                for item in data:
                    for field in fields:
                        if isinstance(item[field], str):
                            item[field] = json.loads(item[field])
                if table == "journal_entries":
                    for item in data:
                        item["content"] = decrypt_text(item["content"])
                write(table, data)
            write("data_requests", rows(db, "SELECT id,type,status,created_at,done_at FROM data_requests WHERE user_id=%s", (user_id,)))
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return name


def deletion_impact(db, user_id):
    verify_scope(db, user_id)
    scopes = {table: sql(db, f"SELECT COUNT(*) FROM `{table}` WHERE {criterion(table)}", (user_id,)).scalar_one()
              for table in scoped_tables(db) + ("mother_account_tokens",)}
    files = sql(db, "SELECT COUNT(*) FROM data_requests WHERE user_id=%s AND file_path IS NOT NULL", (user_id,)).scalar_one()
    return {"records": scopes, "private_export_files": files, "stored_mother_photos": 0,
            "financial_tables": [table for table in FINANCIAL if table in scopes], "production_execution_enabled": False}


def execute_test_deletion(db, user):
    if not E2E_MODE:
        raise HTTPException(409, "Production deletion is pending separate authorization.")
    from app.e2e_guard import verify_database_identity, verify_schema
    verify_database_identity(db.connection())
    verify_schema(db.connection())
    if not user["email"].endswith("@example.com") or not user["email"].split("@")[0].endswith(".e2e"):
        raise HTTPException(409, "Only a synthetic E2E mother account can be deleted.")
    uid = user["id"]
    verify_scope(db, uid)
    if inspect(db.connection()).has_table("billing_orders") and sql(
        db, "SELECT 1 FROM billing_orders WHERE user_id=%s LIMIT 1", (uid,),
    ).first():
        raise HTTPException(409, "Payment record retention requires separate review.")
    feedback = ("ai_feedback_reviews",) if review_storage_present(db) else ()
    order = feedback + ("chat_feedback", "chat_messages", "meal_plan_items") + tuple(t for t in OWNED if t != "chat_feedback")
    quota = ("free_ai_usage_events",) if inspect(db.connection()).has_table("free_ai_usage_events") else ()
    billing = ("weekly_insights", "entitlement_periods") if inspect(db.connection()).has_table("weekly_insights") else ()
    support = ("ticket_replies", "support_tickets", "mother_engagement") if inspect(db.connection()).has_table("faqs") else ()
    receipts = ("food_log_saves",) if inspect(db.connection()).has_table("food_log_saves") else ()
    for table in order + quota + billing + support + receipts + ("mother_account_tokens",):
        sql(db, f"DELETE FROM `{table}` WHERE {criterion(table)}", (uid,))
    if inspect(db.connection()).has_table("ai_daily_quota"):
        from app.services.ai_monitor import account_key
        sql(db, "DELETE FROM ai_daily_quota WHERE account_key=%s",(account_key(uid),))
    files = [file_for(r["file_path"]) for r in rows(db, "SELECT file_path FROM data_requests WHERE user_id=%s AND file_path IS NOT NULL", (uid,))]
    sql(db, "UPDATE data_requests SET file_path=NULL,expires_at=NULL,download_hash=NULL WHERE user_id=%s", (uid,))
    sql(db, "UPDATE users SET username=%s,full_name='Anonymized account',email=%s,hashed_password=%s,"
            "is_active=0,anonymized_at=%s,email_verified_at=NULL,last_active_at=NULL,session_version=session_version+1 WHERE id=%s",
        (f"anonymized-{uid}",f"anonymized-{uid}@invalid.example",hash_password(secrets.token_hex(32)),now(),uid))
    if any(field["name"] == "google_subject" for field in inspect(db.connection()).get_columns("users")):
        sql(db, "UPDATE users SET google_subject=NULL WHERE id=%s", (uid,))
    return files
