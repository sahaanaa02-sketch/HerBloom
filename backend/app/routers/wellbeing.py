
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import SessionLocal
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.mother_profile import MotherProfile

from app.models.wellbeing import (
    WellbeingSchedule,
    WellbeingCheckin,
    JournalEntry,
    WellbeingActivity,
    wellbeing_activity_columns,
    ActivitySession,
)

from app.schemas.wellbeing import (
    CheckinCreate,
    JournalCreate,
    JournalOut,
    ActivityComplete,
)

from app.services.journal_crypto import (
    encrypt_text,
    decrypt_text,
)


router = APIRouter(
    prefix="/wellbeing",
    tags=["Wellbeing"],
)


# ------------------------------------------
# DATABASE DEPENDENCY
# ------------------------------------------

def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


# ------------------------------------------
# MOTHER ACCESS ONLY
# ------------------------------------------

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


# ------------------------------------------
# WEEKLY CHECK-IN SCHEDULE
# ------------------------------------------

def get_schedule(
    db: Session,
    user_id: int,
):
    schedule = db.scalar(
        select(WellbeingSchedule).where(
            WellbeingSchedule.user_id == user_id
        )
    )

    if schedule is None:
        today = date.today()

        schedule = WellbeingSchedule(
            user_id=user_id,
            first_visit=today,
            next_due=today,
        )

        db.add(schedule)
        db.commit()
        db.refresh(schedule)

    return schedule


# ------------------------------------------
# SERIALIZE CHECK-IN
# ------------------------------------------

def serialize_checkin(item):
    if item is None:
        return None

    return {
        "id": item.id,
        "due_date": item.due_date.isoformat(),
        "submitted_on": item.submitted_on.isoformat(),
        "answers": item.answers,
        "support_requested": item.support_requested,
    }


# ------------------------------------------
# JOURNAL SERIALIZATION WITH DECRYPTION
# ------------------------------------------

def serialize_journal(entry):
    return {
        "id": entry.id,
        "prompt": decrypt_text(entry.prompt or ""),
        "content": decrypt_text(entry.content or ""),
        "gratitude": decrypt_text(entry.gratitude or ""),
        "mood_tag": decrypt_text(entry.mood_tag or ""),
        "created_at": entry.created_at,
    }


# ==========================================
# 1. WELLBEING STATUS
# ==========================================

@router.get("/status")
def wellbeing_status(
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    schedule = get_schedule(
        db,
        user.id,
    )

    today = date.today()

    latest = db.scalar(
        select(WellbeingCheckin)
        .where(
            WellbeingCheckin.user_id == user.id
        )
        .order_by(
            WellbeingCheckin.submitted_on.desc(),
            WellbeingCheckin.id.desc(),
        )
        .limit(1)
    )

    return {
        "due": today >= schedule.next_due,
        "first_visit": schedule.first_visit.isoformat(),
        "next_due": schedule.next_due.isoformat(),
        "latest": serialize_checkin(latest),
    }


# ==========================================
# 2. SUBMIT WEEKLY CHECK-IN
# ==========================================

@router.post("/checkins")
def submit_checkin(
    payload: CheckinCreate,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    # Exactly six frequency answers.
    # Question seven is a separate safety response.

    if len(payload.answers) != 6:
        raise HTTPException(
            status_code=422,
            detail="Exactly six frequency answers are required",
        )

    for value in payload.answers:
        if (
            not isinstance(value, int)
            or isinstance(value, bool)
            or value not in (0, 1, 2, 3)
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Each frequency response "
                    "must be 0, 1, 2 or 3"
                ),
            )

    schedule = get_schedule(
        db,
        user.id,
    )

    today = date.today()

    if today < schedule.next_due:
        raise HTTPException(
            status_code=409,
            detail=(
                "Your next weekly check-in "
                "is not due yet"
            ),
        )

    # The first five answers represent
    # frequency of difficult feelings.
    #
    # The sixth answer represents
    # perceived social support.
    #
    # These are educational reflections,
    # not a validated diagnostic score.

    record = WellbeingCheckin(
        user_id=user.id,
        due_date=schedule.next_due,
        submitted_on=today,
        answers={
            "frequency": payload.answers,
            "safety_concern": payload.safety_concern,
        },
        support_requested=(
            payload.request_support
            or payload.safety_concern
        ),
    )

    db.add(record)

    # Next check-in is seven days
    # after the actual submission date.
    #
    # Example:
    # Monday missed -> Tuesday submitted
    # -> next Tuesday.
    #
    # If no submission occurs, the
    # check-in remains available.

    schedule.next_due = (
        today + timedelta(days=7)
    )

    db.commit()
    db.refresh(record)

    return {
        "message": "Check-in saved successfully",
        "next_due": schedule.next_due.isoformat(),
        "show_support": bool(
            record.support_requested
        ),
        "checkin": serialize_checkin(record),
    }


# ==========================================
# 3. CHECK-IN HISTORY
# ==========================================

@router.get("/checkins")
def list_checkins(
    days: int = 30,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    days = max(
        7,
        min(days, 365),
    )

    since = (
        date.today()
        - timedelta(days=days - 1)
    )

    records = db.scalars(
        select(WellbeingCheckin)
        .where(
            WellbeingCheckin.user_id == user.id,
            WellbeingCheckin.submitted_on >= since,
        )
        .order_by(
            WellbeingCheckin.submitted_on.asc(),
            WellbeingCheckin.id.asc(),
        )
    ).all()

    return [
        serialize_checkin(item)
        for item in records
    ]


# ==========================================
# 4. RULE-BASED SUGGESTIONS
# ==========================================

@router.get("/suggestions")
def suggestions(
    checkin_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    query = select(WellbeingCheckin).where(
        WellbeingCheckin.user_id == user.id
    )

    if checkin_id is not None:
        query = query.where(
            WellbeingCheckin.id == checkin_id
        )
    else:
        query = query.order_by(
            WellbeingCheckin.submitted_on.desc(),
            WellbeingCheckin.id.desc(),
        ).limit(1)

    checkin = db.scalar(query)

    if (
        checkin_id is not None
        and checkin is None
    ):
        raise HTTPException(
            status_code=404,
            detail="Check-in not found",
        )

    # Default suggestions for mothers
    # who have not completed a check-in.

    if checkin is None:
        return [
            {
                "title": "Gentle breathing",
                "duration": 2,
                "type": "breathing",
            },
            {
                "title": "A quiet moment",
                "duration": 5,
                "type": "meditation",
            },
        ]

    answers = checkin.answers or {}

    values = answers.get(
        "frequency",
        [],
    )

    difficult = values[:5]

    support = (
        values[5]
        if len(values) > 5
        else 3
    )

    result = []

    # Frequent difficult feelings:
    # suggest a calming breathing activity.

    if any(
        value >= 2
        for value in difficult
    ):
        result.append({
            "title": "A moment to breathe",
            "duration": 2,
            "type": "breathing",
        })

    # Low perceived support or
    # an explicit request for support.

    if (
        support <= 1
        or checkin.support_requested
    ):
        result.append({
            "title": "Find someone to talk to",
            "duration": 2,
            "type": "support",
        })

    # If there are no high-frequency
    # difficult feelings, suggest gratitude.

    if not result:
        result.append({
            "title": "A gratitude reflection",
            "duration": 2,
            "type": "journal",
        })

    # Meditation is a gentle optional
    # activity, not a treatment.

    result.append({
        "title": "Gentle quiet rest",
        "duration": 5,
        "type": "meditation",
    })

    return result[:3]


# ==========================================
# 5. AVAILABLE WELLBEING ACTIVITIES
# ==========================================

def visible_activities(db: Session):
    # Select the original API fields explicitly on both schema versions.
    activity = WellbeingActivity
    query = select(
        activity.id, activity.title, activity.activity_type, activity.duration_minutes,
        activity.audio_url, activity.steps,
    )
    if "editorial_status" in wellbeing_activity_columns(db):
        # New content remains private until A6 implements clinical publication.
        query = query.where(activity.editorial_status.is_(None) | (activity.editorial_status == "published"))
    return query


@router.get("/activities")
def activities(
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
    language: Literal["en", "ta"] | None = None,
):
    if language is None:
        language = db.scalar(select(MotherProfile.language).where(MotherProfile.user_id == user.id))
    query = visible_activities(db)
    if language == "ta" and {"title_ta", "steps_ta"} <= wellbeing_activity_columns(db):
        query = query.add_columns(WellbeingActivity.title_ta, WellbeingActivity.steps_ta)
    records = db.execute(
        query.order_by(
            WellbeingActivity.activity_type,
            WellbeingActivity.duration_minutes,
        )
    ).all()

    return [
        {
            "id": item.id,
            "title": getattr(item, "title_ta", None) or item.title,
            "type": item.activity_type,
            "duration": item.duration_minutes,
            "audio_url": item.audio_url,
            "steps": getattr(item, "steps_ta", None) or item.steps,
        }
        for item in records
    ]


# ==========================================
# 6. COMPLETE WELLBEING ACTIVITY
# ==========================================

@router.post("/activities/complete")
def complete_activity(
    payload: ActivityComplete,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    activity = db.execute(
        visible_activities(db).where(WellbeingActivity.id == payload.activity_id)
    ).one_or_none()

    if activity is None:
        raise HTTPException(
            status_code=404,
            detail="Activity not found",
        )

    session = ActivitySession(
        user_id=user.id,
        activity_id=activity.id,
    )

    db.add(session)
    db.commit()

    return {
        "message": "Activity completed",
        "activity_id": activity.id,
    }


# ==========================================
# 7. GET PRIVATE JOURNAL ENTRIES
# ==========================================

@router.get(
    "/journal",
    response_model=list[JournalOut],
)
def journal_list(
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    entries = db.scalars(
        select(JournalEntry)
        .where(
            JournalEntry.user_id == user.id
        )
        .order_by(
            JournalEntry.created_at.desc(),
            JournalEntry.id.desc(),
        )
    ).all()

    # Decrypt only entries belonging
    # to the authenticated mother.

    return [
        serialize_journal(entry)
        for entry in entries
    ]


# ==========================================
# 8. CREATE ENCRYPTED JOURNAL ENTRY
# ==========================================

@router.post(
    "/journal",
    response_model=JournalOut,
)
def journal_create(
    payload: JournalCreate,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    if not payload.content.strip():
        raise HTTPException(
            status_code=422,
            detail="Journal content cannot be empty",
        )

    # Journal text is encrypted before
    # being stored in MySQL.
    #
    # It is not sent to an AI service.

    entry = JournalEntry(
        user_id=user.id,
        prompt=encrypt_text(
            payload.prompt or ""
        ),
        content=encrypt_text(
            payload.content.strip()
        ),
        gratitude=encrypt_text(
            payload.gratitude or ""
        ),
        mood_tag=encrypt_text(
            payload.mood_tag or ""
        ),
    )

    db.add(entry)
    db.commit()
    db.refresh(entry)

    # Return decrypted text only to
    # the authenticated mother.

    return serialize_journal(entry)


# ==========================================
# 9. DELETE PRIVATE JOURNAL ENTRY
# ==========================================

@router.delete("/journal/{entry_id}")
def journal_delete(
    entry_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(mother_only),
):
    entry = db.scalar(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == user.id,
        )
    )

    if entry is None:
        raise HTTPException(
            status_code=404,
            detail="Journal entry not found",
        )

    db.delete(entry)
    db.commit()

    return {
        "message": "Journal entry deleted successfully",
        "entry_id": entry_id,
    }
