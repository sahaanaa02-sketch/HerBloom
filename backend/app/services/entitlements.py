"""Server-owned Trial and prepaid Premium entitlements."""
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import case, column, func, inspect, select, table
from sqlalchemy.exc import IntegrityError

from app.services import free_quota

PLANS = {
    "free": {"price_lkr": 0, "duration_days": None, "limits": free_quota.FREE_LIMITS},
    "trial": {"price_lkr": 0, "duration_days": 7, "limits": {"scan": 7, "chat": 25}},
    "premium": {"price_lkr": 790, "duration_days": 30, "limits": {"scan": 30, "chat": 150}},
}


@dataclass(frozen=True)
class Entitlement:
    code: str
    id: int | None
    starts: datetime
    ends: datetime
    trial_eligible: bool
    access_ends: datetime | None = None


def ready(db):
    return inspect(db.connection()).has_table("weekly_insights")


def require_ready(db):
    if not ready(db) or not free_quota.ready(db):
        raise HTTPException(503, "Entitlements are awaiting their database migration.")


def utc_naive(value):
    if value.utcoffset() is None:
        raise ValueError("An explicit time zone is required.")
    return value.astimezone(UTC).replace(tzinfo=None)


def periods(db, user_id):
    return db.connection().exec_driver_sql(
        "SELECT id,plan_code,starts_at_utc,ends_at_utc FROM entitlement_periods "
        "WHERE user_id=%s ORDER BY starts_at_utc,id", (user_id,)
    ).all()


def current_plan_expression(db, users, now):
    """Resolve the A12 plan for an audience without loading individual accounts."""
    if not ready(db) or not free_quota.ready(db):
        return None
    active = table("entitlement_periods", column("id"), column("user_id"),
                   column("plan_code"), column("starts_at_utc"), column("ends_at_utc"))
    stamp = utc_naive(now)
    paid_or_trial = (
        select(active.c.plan_code)
        .where(active.c.user_id == users.c.id, active.c.starts_at_utc <= stamp, stamp < active.c.ends_at_utc)
        .order_by(active.c.starts_at_utc, active.c.id)
        .limit(1)
        .correlate(users)
        .scalar_subquery()
    )
    # Unavailable or future activation anchors are also rejected by current().
    return case((column("activated_at_utc", _selectable=users) <= stamp,
                 func.coalesce(paid_or_trial, "free")))


def current(db, user_id, now, anchor=None):
    if anchor is None:
        anchor = db.connection().exec_driver_sql(
            "SELECT activated_at_utc FROM users WHERE id=%s AND role='MOTHER'", (user_id,)
        ).scalar_one_or_none()
    if not isinstance(anchor, datetime):
        raise HTTPException(503, "This account's activation timestamp requires review.")
    try:
        free = free_quota.free_quota_window(anchor.replace(tzinfo=UTC), now)
    except ValueError:
        raise HTTPException(503, "This account's activation timestamp requires review.") from None

    stamp = utc_naive(now)
    entries = periods(db, user_id)
    candidate = next((row for row in entries if row.starts_at_utc <= stamp < row.ends_at_utc), None)
    eligible = not any(row.plan_code == "trial" or row.ends_at_utc > stamp for row in entries)
    if candidate:
        access_end = candidate.ends_at_utc
        if candidate.plan_code == "premium":
            for row in entries:
                if row.plan_code == "premium" and row.starts_at_utc == access_end:
                    access_end = row.ends_at_utc
        return Entitlement(candidate.plan_code, candidate.id, candidate.starts_at_utc,
                           candidate.ends_at_utc, eligible, access_end)
    return Entitlement("free", None, utc_naive(free.starts_at), utc_naive(free.ends_at), eligible)


def guided_access(db, user_id, now):
    stamp = utc_naive(now)
    return any(row.starts_at_utc <= stamp < row.ends_at_utc for row in periods(db, user_id))


def remaining(db, user_id, entitlement):
    counts = dict(db.connection().exec_driver_sql(
        "SELECT feature,COUNT(*) FROM free_ai_usage_events WHERE user_id=%s "
        "AND entitlement_code=%s AND window_start_utc=%s GROUP BY feature",
        (user_id, entitlement.code, entitlement.starts),
    ).all())
    return {feature: max(0, quota - counts.get(feature, 0))
            for feature, quota in PLANS[entitlement.code]["limits"].items()}


def lock_account(db, user_id):
    return free_quota.lock_account(db, user_id)


def insert_period(db, user_id, code, ref, start):
    end = start + timedelta(days=PLANS[code]["duration_days"])
    return db.connection().exec_driver_sql(
        "INSERT INTO entitlement_periods (user_id,plan_code,source_ref,starts_at_utc,ends_at_utc)"
        " VALUES (%s,%s,%s,%s,%s)", (user_id, code, ref, start, end)
    ).lastrowid


def start_trial(db, user_id):
    require_ready(db)
    account = lock_account(db, user_id)
    now = free_quota.utc_now()
    state = current(db, user_id, now, account.activated_at_utc)
    if not state.trial_eligible:
        raise HTTPException(409, "A trial is unavailable for this account.")
    insert_period(db, user_id, "trial", f"trial:{user_id}", utc_naive(now))
    return current(db, user_id, now, account.activated_at_utc)


def apply_verified_purchase(db, user_id, purchase_ref, *, locked_account=None):
    """Trusted billing integration boundary. Caller verifies payment and commits."""
    require_ready(db)
    if not isinstance(purchase_ref, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,120}", purchase_ref):
        raise ValueError("Invalid verified order reference.")
    account = locked_account if locked_account is not None else lock_account(db, user_id)
    now = free_quota.utc_now()
    current(db, user_id, now, account.activated_at_utc)
    ref = f"paid:{purchase_ref}"
    row = db.connection().exec_driver_sql(
        "SELECT id,user_id FROM entitlement_periods WHERE source_ref=%s", (ref,)
    ).one_or_none()
    if row:
        if row.user_id != user_id:
            raise HTTPException(409, "Purchase reference belongs to a different account.")
        return row.id
    start = max([utc_naive(now), *(row.ends_at_utc for row in periods(db, user_id))])
    try:
        with db.begin_nested():
            return insert_period(db, user_id, "premium", ref, start)
    except IntegrityError as error:
        if error.orig.args[0] != 1062:
            raise
        raise HTTPException(409, "Purchase reference has already been used.") from None
