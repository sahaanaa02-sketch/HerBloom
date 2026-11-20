"""Free Forever quota periods, independent of account timestamp storage."""
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from math import ceil
from types import MappingProxyType
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlalchemy.exc import OperationalError

logger = logging.getLogger(__name__)

FREE_LIMITS = MappingProxyType({"scan": 3, "chat": 10})
WINDOW_LENGTH = timedelta(days=30)
DISPLAY_TIMEZONE = ZoneInfo("Asia/Colombo")


@dataclass(frozen=True)
class FreeQuotaWindow:
    starts_at: datetime
    ends_at: datetime

    @property
    def resets_at_colombo(self) -> datetime:
        return self.ends_at.astimezone(DISPLAY_TIMEZONE)


def free_quota_window(activated_at: datetime, at: datetime) -> FreeQuotaWindow:
    """Return the half-open UTC quota window for a verified activation instant."""
    if activated_at.utcoffset() is None or at.utcoffset() is None:
        raise ValueError("Activation and request timestamps must carry a time zone.")
    anchor = activated_at.astimezone(UTC)
    elapsed = at.astimezone(UTC) - anchor
    if elapsed < timedelta():
        raise ValueError("A quota window is unavailable before activation.")
    start = anchor + (elapsed // WINDOW_LENGTH) * WINDOW_LENGTH
    return FreeQuotaWindow(start, start + WINDOW_LENGTH)

def utc_now():
    return datetime.now(UTC)


def ready(db):
    schema = inspect(db.connection())
    if not schema.has_table("free_ai_usage_events"):
        return False
    if not any(c["name"] == "activated_at_utc" for c in schema.get_columns("users")):
        raise HTTPException(503, "Free quota storage is incomplete.")
    return True


def legacy_activation_utc(created_at, at):
    if not isinstance(created_at, datetime) or created_at.utcoffset() is not None:
        raise ValueError("Invalid legacy account creation timestamp.")
    local = created_at.replace(tzinfo=DISPLAY_TIMEZONE, fold=0)
    anchor = local.astimezone(UTC)
    if (local.utcoffset() != local.replace(fold=1).utcoffset()
            or anchor.astimezone(DISPLAY_TIMEZONE).replace(tzinfo=None) != created_at):
        raise ValueError("Legacy creation timestamp is ambiguous or nonexistent in Asia/Colombo.")
    if anchor > at:
        raise ValueError("Legacy account creation timestamp is in the future.")
    return anchor


def freeze_legacy_anchors(db):
    """Validate all legacy rows before writing any anchors. Caller commits."""
    connection = db.connection()
    rows = connection.exec_driver_sql(
        "SELECT id, created_at FROM users WHERE role='MOTHER' AND activated_at_utc IS NULL ORDER BY id FOR UPDATE"
    ).all()
    now = utc_now()
    anchors = []
    invalid_ids = []
    for user_id, created_at in rows:
        try:
            anchor = legacy_activation_utc(created_at, now)
        except ValueError:
            invalid_ids.append(user_id)
        else:
            anchors.append((anchor.replace(tzinfo=None), user_id))
    if invalid_ids:
        raise ValueError(f"Missing or invalid legacy activation timestamp for user IDs: {invalid_ids}")
    if anchors:
        connection.exec_driver_sql("UPDATE users SET activated_at_utc=%s, updated_at=updated_at WHERE id=%s", anchors)
    return len(anchors)


def record_signup(db, user_id, activated_at):
    if activated_at.utcoffset() is None:
        raise ValueError("Signup activation timestamp must carry a time zone.")
    if ready(db):
        db.connection().exec_driver_sql(
            "UPDATE users SET activated_at_utc=%s WHERE id=%s",
            (activated_at.astimezone(UTC).replace(tzinfo=None), user_id),
        )


@dataclass(frozen=True)
class FreeQuotaCharge:
    user_id: int
    feature: str
    request_key: str
    window_start_utc: datetime
    entitlement_code: str | None = None

    def record_success(self, db):
        if self.entitlement_code is not None:
            db.connection().exec_driver_sql(
                "INSERT INTO free_ai_usage_events (user_id,feature,request_key,window_start_utc,entitlement_code)"
                " VALUES (%s,%s,%s,%s,%s)",
                (self.user_id, self.feature, self.request_key, self.window_start_utc, self.entitlement_code),
            )
            return
        db.connection().exec_driver_sql(
            "INSERT INTO free_ai_usage_events (user_id,feature,request_key,window_start_utc) VALUES (%s,%s,%s,%s)",
            (self.user_id, self.feature, self.request_key, self.window_start_utc),
        )


def lock_account(db, user_id, *, require_active=True):
    # Authentication and content validation have only read so far. Start a
    # fresh snapshot after taking the account lock, so quota reads see the
    # previous request's commit without locking gaps in the usage index.
    db.rollback()
    connection = db.connection()
    try:
        row = connection.exec_driver_sql(
            "SELECT is_active, activated_at_utc FROM users WHERE id=%s AND role='MOTHER' FOR UPDATE NOWAIT",
            (user_id,),
        ).one_or_none()
    except OperationalError as exc:
        if exc.orig.args[0] == 3572:
            raise HTTPException(409, "Another account request is in progress. Retry with the same key.") from None
        raise
    if not row or (require_active and not row.is_active):
        raise HTTPException(403, "This account is inactive.")
    return row


def begin_request(db, user_id, feature, key):
    """Serialize requests for this account until the caller commits or rolls back."""
    if not ready(db):
        return None
    try:
        request_key = str(UUID(key or ""))
    except ValueError:
        raise HTTPException(422, "A valid Idempotency-Key header is required.") from None

    row = lock_account(db, user_id)
    connection = db.connection()
    if not isinstance(row.activated_at_utc, datetime):
        logger.error("Missing or invalid UTC quota anchor for mother account %s", user_id)
        raise HTTPException(503, "This account's activation timestamp requires review.")
    now = utc_now()
    try:
        window = free_quota_window(row.activated_at_utc.replace(tzinfo=UTC), now)
    except ValueError:
        logger.error("Future UTC quota anchor for mother account %s", user_id)
        raise HTTPException(503, "This account's activation timestamp requires review.") from None

    if connection.exec_driver_sql(
        "SELECT 1 FROM free_ai_usage_events WHERE user_id=%s AND feature=%s AND request_key=%s",
        (user_id, feature, request_key),
    ).first():
        raise HTTPException(409, "This request already completed. No additional allowance was used.")
    from app.services import entitlements

    if entitlements.ready(db):
        state = entitlements.current(db, user_id, now, row.activated_at_utc)
        if entitlements.remaining(db, user_id, state)[feature] <= 0:
            raise exhausted(state.ends.replace(tzinfo=UTC), now)
        return FreeQuotaCharge(user_id, feature, request_key, state.starts, state.code)

    start = window.starts_at.replace(tzinfo=None)
    used = connection.exec_driver_sql(
        "SELECT request_key FROM free_ai_usage_events WHERE user_id=%s AND feature=%s AND window_start_utc=%s",
        (user_id, feature, start),
    ).all()
    if len(used) >= FREE_LIMITS[feature]:
        raise exhausted(window.ends_at, now)
    return FreeQuotaCharge(user_id, feature, request_key, start)


def exhausted(end, now):
    return HTTPException(429, "AI allowance used for this period.",
                         headers={"Retry-After": str(max(1, ceil((end - now).total_seconds())))})
