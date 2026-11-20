"""Private, consent-based A12 AI notes using existing provider monitoring."""
from datetime import UTC, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select

from app.config import external_setting
from app.models.hydration import HydrationLog
from app.models.mother_profile import MotherProfile
from app.models.nutrition import FoodLog
from app.models.recovery import BodyCheck, SleepLog, WalkLog
from app.models.wellbeing import WellbeingCheckin
from app.services import entitlements, free_quota
from app.services.ai_gateway import AIUnavailable, generate_weekly_summary


def interval(state, stamp):
    if state.code == "free":
        return None
    length = timedelta(days=7)
    start = state.starts if state.code == "trial" else state.starts + ((stamp - state.starts) // length) * length
    end = start + length
    return (start, end) if end <= state.ends else None


def minimum_days(plan):
    # Explicit configuration is required before generating any new AI notes.
    timing = external_setting(f"A12_{plan.upper()}_INSIGHT_TIMING")
    raw = external_setting(f"A12_{plan.upper()}_INSIGHT_MIN_DAYS")
    if timing != "during_interval" or raw not in {str(n) for n in range(1, 8)}:
        return None
    return int(raw)


def aggregate(db, user_id, start, end, stamp):
    zone = free_quota.DISPLAY_TIMEZONE
    local_start = start.replace(tzinfo=UTC).astimezone(zone)
    local_end = min(end, stamp).replace(tzinfo=UTC).astimezone(zone)
    # Date-only logs cannot be attributed safely to a partial entitlement day.
    first_date = local_start.date() + timedelta(days=bool(local_start.hour or local_start.minute or
                                                          local_start.second or local_start.microsecond))
    last_exclusive = local_end.date()
    recorded = set()

    def rows(model, day, *columns):
        result = db.execute(select(day, *columns).where(
            model.user_id == user_id, day >= first_date, day < last_exclusive
        ).group_by(day)).all()
        recorded.update(row[0] for row in result)
        return result

    sleep = rows(SleepLog, SleepLog.date, func.sum(SleepLog.hours))
    walking = rows(WalkLog, WalkLog.date, func.sum(WalkLog.minutes))
    mood = rows(WellbeingCheckin, WellbeingCheckin.submitted_on, func.count())
    pain = rows(BodyCheck, BodyCheck.date, func.max(BodyCheck.back_pain))
    meals = rows(FoodLog, FoodLog.date, func.count(func.distinct(FoodLog.meal_type)))
    hydration = rows(HydrationLog, HydrationLog.date, func.sum(HydrationLog.glasses))

    def total(values):
        return sum(r[1] for r in values) if values else None

    def mean(values):
        return round(float(total(values)) / len(values), 2) if values else None

    return {
        "sleep": {"average_hours": mean(sleep), "nights_logged": len(sleep)},
        "walking": {"days_walked": len(walking), "total_minutes": total(walking)},
        "wellbeing": {"checkins": total(mood)},
        "recovery": {"back_pain_days_recorded": total(pain)},
        "nutrition": {"meals_logged": total(meals)},
        "hydration": {"average_glasses": mean(hydration), "days_logged": len(hydration)},
        "completeness": {"days_with_data": len(recorded), "days_in_week": 7},
    }


def consent(db, user_id, lock=False):
    query = select(MotherProfile.consent_ai_profile, MotherProfile.language).where(MotherProfile.user_id == user_id)
    return db.execute(query.with_for_update() if lock else query).one_or_none()


def eligibility(db, user_id, state, now, profile=None):
    span = interval(state, entitlements.utc_naive(now))
    if span is None:
        return "plan_or_interval_unavailable", None, None
    if db.connection().exec_driver_sql(
        "SELECT 1 FROM weekly_insights WHERE entitlement_id=%s AND starts_at_utc=%s",
        (state.id, span[0]),
    ).first():
        return "already_generated", span, None
    profile = profile if profile is not None else consent(db, user_id)
    if profile is None or not profile.consent_ai_profile:
        return "consent_required", span, None
    required = minimum_days(state.code)
    if required is None:
        return "policy_pending", span, None
    data = aggregate(db, user_id, *span, entitlements.utc_naive(now))
    if data["completeness"]["days_with_data"] < required:
        return "insufficient_data", span, None
    return "eligible", span, data


def history(db, user_id, before=None):
    cursor = "AND i.id<%s" if before is not None else ""
    params = (user_id, before) if before is not None else (user_id,)
    rows = db.connection().exec_driver_sql(
        "SELECT i.id,p.plan_code,i.starts_at_utc,i.ends_at_utc,i.generated_at_utc,i.language,i.note "
        "FROM weekly_insights i JOIN entitlement_periods p ON p.id=i.entitlement_id "
        f"WHERE p.user_id=%s {cursor} ORDER BY i.id DESC LIMIT 20", params,
    ).mappings()
    return [dict(row, **{key: row[key].replace(tzinfo=UTC) for key in
            ("starts_at_utc", "ends_at_utc", "generated_at_utc")}) for row in rows]


def generate(db, user_id):
    entitlements.require_ready(db)
    account = entitlements.lock_account(db, user_id)
    # Use a locking read to prevent consent changing while the note is generated.
    profile = consent(db, user_id, lock=True)
    now = free_quota.utc_now()
    state = entitlements.current(db, user_id, now, account.activated_at_utc)
    reason, span, data = eligibility(db, user_id, state, now, profile)
    if reason != "eligible":
        raise HTTPException(409, reason)
    language = "ta" if profile.language == "ta" else "en"
    try:
        note = generate_weekly_summary(data, language, db=db, user_id=user_id)
    except AIUnavailable:
        raise HTTPException(503, "AI insight is temporarily unavailable.") from None
    inserted = db.connection().exec_driver_sql(
        "INSERT INTO weekly_insights (entitlement_id,starts_at_utc,ends_at_utc,note,language,generated_at_utc,recorded_days) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (state.id, *span, note, language, entitlements.utc_naive(free_quota.utc_now()),
         data["completeness"]["days_with_data"]),
    )
    note_id = inserted.lastrowid
    result = history(db, user_id, before=note_id + 1)[0]
    db.commit()
    return result
