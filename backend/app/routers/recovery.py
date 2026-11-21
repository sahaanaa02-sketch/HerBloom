
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.mother_profile import MotherProfile

from app.models.recovery import (
    SleepLog,
    WalkLog,
    BodyCheck,
    RecoveryExercise,
    ExerciseSession,
)

from app.schemas.recovery import (
    SleepIn,
    WalkIn,
    BodyCheckIn,
    ExerciseSessionIn,
)

from app.services import entitlements, free_quota
from app.services.recovery_rules import (
    local_today,
    recent_symptom_pause,
    exercise_eligibility,
)


router = APIRouter(
    prefix="/recovery",
    tags=["My Recovery"],
)


# --------------------------------------
# DATABASE DEPENDENCY
# --------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --------------------------------------
# AUTHENTICATION
# --------------------------------------

def mother_only(
    user: User = Depends(get_current_user),
):
    role = getattr(user.role, "value", user.role)

    if str(role).upper() != "MOTHER":
        raise HTTPException(
            status_code=403,
            detail="Mother access only",
        )

    return user


# --------------------------------------
# COMMON HELPERS
# --------------------------------------

def serialize(row):
    from sqlalchemy.inspection import inspect

    return {
        column.key: getattr(row, column.key)
        for column in inspect(row).mapper.column_attrs
    }


def owned(db, model, row_id, user_id):
    row = db.scalar(
        select(model).where(
            model.id == row_id,
            model.user_id == user_id,
        )
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Entry not found",
        )

    return row


def date_range(query, model, start, end):
    if start and end and start > end:
        raise HTTPException(
            status_code=422,
            detail="Invalid date range",
        )

    if start:
        query = query.where(model.date >= start)

    if end:
        query = query.where(model.date <= end)

    return query


def valid_log_date(value):
    if value > local_today():
        raise HTTPException(
            status_code=422,
            detail="Future dates are not allowed",
        )


def sleep_hours(bed_time, wake_time):
    start = datetime.combine(
        local_today(),
        bed_time,
    )

    finish = datetime.combine(
        local_today(),
        wake_time,
    )

    if finish <= start:
        finish += timedelta(days=1)

    hours = round(
        (finish - start).total_seconds() / 3600,
        2,
    )

    if not 0 < hours <= 24:
        raise HTTPException(
            status_code=422,
            detail="Invalid sleep duration",
        )

    return hours


# --------------------------------------
# ONBOARDING PROFILE INTEGRATION
# --------------------------------------

def mother_recovery_context(
    db: Session,
    user_id: int,
):
    """
    MotherProfile is the single source of truth.

    Birth date, delivery type and exercise
    clearance come from onboarding/settings.
    """

    profile = db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == user_id
        )
    )

    if profile is None:
        return None

    if not profile.onboarding_done:
        return None

    if profile.baby_birth_date is None:
        return None

    if profile.delivery_type not in (
        "vaginal",
        "csection",
    ):
        return None

    return profile


def recovery_context_response(profile):
    if profile is None:
        return {
            "configured": False,
            "message": (
                "Complete your onboarding profile "
                "to view your recovery stage."
            ),
        }

    today = local_today()

    postpartum_days = (
        today - profile.baby_birth_date
    ).days

    if postpartum_days < 0:
        return {
            "configured": False,
            "message": "Birth date cannot be in the future.",
        }

    # Birth date is postpartum Day 1.
    postpartum_day = postpartum_days + 1

    postpartum_week = postpartum_days // 7

    # Profile Settings stores clearance as "yes" / "not_yet".
    exercise_cleared = (
        profile.exercise_cleared == "yes"
    )

    # Existing frontend uses c_section.
    frontend_delivery_type = (
        "c_section"
        if profile.delivery_type == "csection"
        else "vaginal"
    )

    return {
        "configured": True,
        "birth_date": profile.baby_birth_date,
        "delivery_type": frontend_delivery_type,
        "postpartum_day": postpartum_day,
        "postpartum_week": postpartum_week,
        "exercise_cleared": exercise_cleared,
        "activity_limits": profile.activity_limits,
        "activity_limits_note": profile.activity_limits_note,
        "source": "mother_profile",
    }


# --------------------------------------
# RECOVERY CONTEXT ENDPOINT
# --------------------------------------

@router.get("/context")
def get_context(
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    profile = mother_recovery_context(
        db,
        user.id,
    )

    return recovery_context_response(profile)


# --------------------------------------
# LEGACY CONTEXT ENDPOINT
# --------------------------------------

@router.put("/context")
def save_context(
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    """
    Recovery details are now managed through
    onboarding and profile settings.

    This endpoint is retained for compatibility,
    but does not create duplicate recovery data.
    """

    profile = mother_recovery_context(
        db,
        user.id,
    )

    if profile is None:
        raise HTTPException(
            status_code=409,
            detail=(
                "Complete onboarding before "
                "using My Recovery."
            ),
        )

    return {
        "message": (
            "Recovery details are automatically "
            "synchronized with your mother profile."
        ),
        "context": recovery_context_response(profile),
    }


# --------------------------------------
# SLEEP TRACKER - GET
# --------------------------------------

@router.get("/sleep")
def list_sleep(
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    query = select(SleepLog).where(
        SleepLog.user_id == user.id
    )

    query = date_range(
        query,
        SleepLog,
        start,
        end,
    )

    rows = db.scalars(
        query.order_by(
            SleepLog.date.desc(),
            SleepLog.id.desc(),
        )
    ).all()

    return [
        serialize(row)
        for row in rows
    ]


# --------------------------------------
# SLEEP TRACKER - CREATE
# --------------------------------------

@router.post("/sleep")
def create_sleep(
    payload: SleepIn,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    valid_log_date(payload.date)

    row = SleepLog(
        user_id=user.id,
        **payload.model_dump(),
        hours=sleep_hours(
            payload.bed_time,
            payload.wake_time,
        ),
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return serialize(row)


# --------------------------------------
# SLEEP TRACKER - UPDATE
# --------------------------------------

@router.put("/sleep/{row_id}")
def update_sleep(
    row_id: int,
    payload: SleepIn,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    row = owned(
        db,
        SleepLog,
        row_id,
        user.id,
    )

    valid_log_date(payload.date)

    for key, value in payload.model_dump().items():
        setattr(row, key, value)

    row.hours = sleep_hours(
        payload.bed_time,
        payload.wake_time,
    )

    db.commit()
    db.refresh(row)

    return serialize(row)


# --------------------------------------
# SLEEP TRACKER - DELETE
# --------------------------------------

@router.delete("/sleep/{row_id}")
def delete_sleep(
    row_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    row = owned(
        db,
        SleepLog,
        row_id,
        user.id,
    )

    db.delete(row)
    db.commit()

    return {
        "message": "Sleep log deleted",
    }


# --------------------------------------
# WALKING TRACKER - GET
# --------------------------------------

@router.get("/walks")
def list_walks(
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    query = select(WalkLog).where(
        WalkLog.user_id == user.id
    )

    query = date_range(
        query,
        WalkLog,
        start,
        end,
    )

    rows = db.scalars(
        query.order_by(
            WalkLog.date.desc(),
            WalkLog.id.desc(),
        )
    ).all()

    return [
        serialize(row)
        for row in rows
    ]


# --------------------------------------
# WALKING TRACKER - CREATE
# --------------------------------------

@router.post("/walks")
def create_walk(
    payload: WalkIn,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    valid_log_date(payload.date)

    row = WalkLog(
        user_id=user.id,
        **payload.model_dump(),
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return serialize(row)


# --------------------------------------
# WALKING TRACKER - UPDATE
# --------------------------------------

@router.put("/walks/{row_id}")
def update_walk(
    row_id: int,
    payload: WalkIn,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    row = owned(
        db,
        WalkLog,
        row_id,
        user.id,
    )

    valid_log_date(payload.date)

    for key, value in payload.model_dump().items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)

    return serialize(row)


# --------------------------------------
# WALKING TRACKER - DELETE
# --------------------------------------

@router.delete("/walks/{row_id}")
def delete_walk(
    row_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    row = owned(
        db,
        WalkLog,
        row_id,
        user.id,
    )

    db.delete(row)
    db.commit()

    return {
        "message": "Walk log deleted",
    }


# --------------------------------------
# BODY CHECK - GET
# --------------------------------------

@router.get("/body-checks")
def list_body_checks(
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    rows = db.scalars(
        select(BodyCheck)
        .where(
            BodyCheck.user_id == user.id
        )
        .order_by(
            BodyCheck.date.desc(),
            BodyCheck.id.desc(),
        )
        .limit(100)
    ).all()

    return [
        serialize(row)
        for row in rows
    ]


# --------------------------------------
# BODY CHECK - CREATE
# --------------------------------------

@router.post("/body-checks")
def create_body_check(
    payload: BodyCheckIn,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    valid_log_date(payload.date)

    row = BodyCheck(
        user_id=user.id,
        **payload.model_dump(),
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return serialize(row)


# --------------------------------------
# BODY CHECK - UPDATE
# --------------------------------------

@router.put("/body-checks/{row_id}")
def update_body_check(
    row_id: int,
    payload: BodyCheckIn,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    row = owned(
        db,
        BodyCheck,
        row_id,
        user.id,
    )

    valid_log_date(payload.date)

    for key, value in payload.model_dump().items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)

    return serialize(row)


# --------------------------------------
# BODY CHECK - DELETE
# --------------------------------------

@router.delete("/body-checks/{row_id}")
def delete_body_check(
    row_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    row = owned(
        db,
        BodyCheck,
        row_id,
        user.id,
    )

    db.delete(row)
    db.commit()

    return {
        "message": "Body check deleted",
    }


# --------------------------------------
# EXERCISE ELIGIBILITY
# --------------------------------------

MOTHER_EXERCISE_FIELDS = (
    "id", "name", "category", "level", "steps", "duration_minutes",
    "equipment", "safety_notes", "contraindications", "min_week",
    "allowed_delivery_types", "needs_clearance", "image_url", "video_url",
    "reviewed_by", "review_date",
)


def visible_exercises_query():
    query = select(RecoveryExercise)
    # The column is mapped only after the migration has been verified.
    editorial_status = RecoveryExercise.__table__.c.get("editorial_status")
    if editorial_status is not None:
        return query.where(editorial_status.is_(None) | (editorial_status == "published"))
    return query


def exercise_list(
    db: Session,
    user_id: int,
):
    profile = mother_recovery_context(
        db,
        user_id,
    )

    paused = recent_symptom_pause(
        db,
        user_id,
    )

    exercises = db.scalars(
        visible_exercises_query().order_by(
            RecoveryExercise.category,
            RecoveryExercise.name,
        )
    ).all()

    gated = entitlements.ready(db)
    approved_ids = set()
    has_plan = False
    if gated:
        has_plan = entitlements.guided_access(db, user_id, free_quota.utc_now())
        approved_ids = set(db.connection().exec_driver_sql(
            "SELECT DISTINCT entity_id FROM clinical_publications WHERE entity='recovery_exercises'"
        ).scalars())

    result = []
    for exercise in exercises:
        allowed, reason = exercise_eligibility(
            exercise,
            profile,
            paused,
        )

        fields = {field: getattr(exercise, field) for field in MOTHER_EXERCISE_FIELDS}
        if profile is not None and profile.language == "ta":
            for field in ("name", "steps", "safety_notes", "contraindications"):
                fields[field] = getattr(exercise, f"{field}_ta") or fields[field]
        if gated:
            if allowed and (exercise.editorial_status != "published" or exercise.id not in approved_ids):
                allowed, reason = False, "Guided routine is awaiting clinical approval."
            if allowed and not has_plan:
                allowed, reason = False, "Guided routines are available on Trial and Premium."
            if not allowed:
                fields.update(steps=[], equipment=None, image_url=None, video_url=None)
        result.append({
            **fields,
            "locked": not allowed,
            "lock_reason": reason,
            "paused_symptoms": paused,
        })

    return result


# --------------------------------------
# EXERCISES FOR ME
# --------------------------------------

@router.get("/exercises/for-me")
def exercises_for_me(
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    return exercise_list(
        db,
        user.id,
    )


# --------------------------------------
# TODAY'S EXERCISES
# --------------------------------------

@router.get("/exercises/today")
def exercises_today(
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    available = [
        item
        for item in exercise_list(db, user.id)
        if not item["locked"]
    ]

    chosen = []
    categories = set()

    for item in available:
        if item["category"] not in categories:
            chosen.append(item)
            categories.add(item["category"])

        if len(chosen) == 3:
            break

    return chosen


# --------------------------------------
# EXERCISE SESSION
# --------------------------------------

@router.post("/exercise-sessions")
def create_exercise_session(
    payload: ExerciseSessionIn,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    exercise = db.scalar(
        visible_exercises_query().where(RecoveryExercise.id == payload.exercise_id)
    )

    if exercise is None:
        raise HTTPException(
            status_code=404,
            detail="Exercise not found",
        )

    available = {
        item["id"]: item
        for item in exercise_list(db, user.id)
    }

    selected = available.get(
        exercise.id
    )

    if selected is None or selected["locked"]:
        raise HTTPException(
            status_code=409,
            detail="This activity is currently locked",
        )

    row = ExerciseSession(
        user_id=user.id,
        **payload.model_dump(),
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "message": "Exercise session saved",
        "session": serialize(row),
        "paused_symptoms": (
            payload.pain
            or payload.bleeding
            or payload.pelvic_heaviness
        ),
    }


# --------------------------------------
# DASHBOARD SUMMARY
# --------------------------------------

@router.get("/summary")
def recovery_summary(
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    today = local_today()

    week_start = today - timedelta(days=6)

    sleeps = db.scalars(
        select(SleepLog).where(
            SleepLog.user_id == user.id,
            SleepLog.date >= week_start,
            SleepLog.date <= today,
        )
    ).all()

    walks = db.scalars(
        select(WalkLog).where(
            WalkLog.user_id == user.id,
            WalkLog.date >= week_start,
            WalkLog.date <= today,
        )
    ).all()

    bodies = db.scalars(
        select(BodyCheck).where(
            BodyCheck.user_id == user.id,
            BodyCheck.date >= week_start,
        )
    ).all()

    today_sleep = [
        item
        for item in sleeps
        if item.date == today
    ]

    today_walks = [
        item
        for item in walks
        if item.date == today
    ]

    daily_walks = {}

    for item in walks:
        key = item.date.isoformat()

        daily_walks[key] = (
            daily_walks.get(key, 0)
            + item.minutes
        )

    streak = 0
    cursor = today

    while daily_walks.get(
        cursor.isoformat(), 0
    ) > 0:
        streak += 1
        cursor -= timedelta(days=1)

    profile = mother_recovery_context(
        db,
        user.id,
    )

    return {
        "date": today.isoformat(),
        "context": recovery_context_response(profile),
        "today_sleep_hours": round(
            sum(
                item.hours
                for item in today_sleep
            ),
            2,
        ),
        "today_walk_minutes": sum(
            item.minutes
            for item in today_walks
        ),
        "weekly_walk_minutes": sum(
            item.minutes
            for item in walks
        ),
        "walking_streak": streak,
        "sleep_logs": [
            serialize(item)
            for item in sleeps
        ],
        "walk_logs": [
            serialize(item)
            for item in walks
        ],
        "recent_symptoms": recent_symptom_pause(
            db,
            user.id,
        ),
        "body_check_count": len(bodies),
    }


# --------------------------------------
# POSTPARTUM CALENDAR
# --------------------------------------

@router.get("/calendar")
def recovery_calendar(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    from calendar import monthrange

    if (
        year < 2000
        or year > 2100
        or month < 1
        or month > 12
    ):
        raise HTTPException(
            status_code=422,
            detail="Invalid month",
        )

    start = date(
        year,
        month,
        1,
    )

    end = date(
        year,
        month,
        monthrange(year, month)[1],
    )

    days = {}

    def add(day, category):
        key = day.isoformat()

        days.setdefault(
            key,
            set(),
        ).add(category)

    for model, category in [
        (SleepLog, "sleep"),
        (WalkLog, "walking"),
        (BodyCheck, "body_check"),
    ]:
        rows = db.scalars(
            select(model).where(
                model.user_id == user.id,
                model.date >= start,
                model.date <= end,
            )
        ).all()

        for row in rows:
            add(
                row.date,
                category,
            )

    sessions = db.scalars(
        select(ExerciseSession).where(
            ExerciseSession.user_id == user.id,
            ExerciseSession.completed_at >= datetime.combine(
                start,
                datetime.min.time(),
            ),
            ExerciseSession.completed_at < datetime.combine(
                end + timedelta(days=1),
                datetime.min.time(),
            ),
        )
    ).all()

    for session in sessions:
        add(
            session.completed_at.date(),
            "exercise",
        )

    return {
        "year": year,
        "month": month,
        "days": {
            day: sorted(categories)
            for day, categories in days.items()
        },
    }
