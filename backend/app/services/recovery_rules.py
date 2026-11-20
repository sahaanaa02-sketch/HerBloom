
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.models.recovery import (
    BodyCheck,
    ExerciseSession,
)


# --------------------------------------
# SRI LANKA LOCAL TIME
# --------------------------------------

COLOMBO = ZoneInfo("Asia/Colombo")


def local_today():
    return datetime.now(COLOMBO).date()


# --------------------------------------
# RECENT SYMPTOM SAFETY CHECK
# --------------------------------------

def recent_symptom_pause(
    db: Session,
    user_id: int,
):
    today = local_today()
    since = today - timedelta(days=2)

    body = db.scalar(
        select(BodyCheck.id).where(
            BodyCheck.user_id == user_id,
            BodyCheck.date >= since,
            BodyCheck.date <= today,
            or_(
                BodyCheck.wound.is_(True),
                BodyCheck.bleeding_level.in_(
                    ["moderate", "heavy"]
                ),
                BodyCheck.back_pain.is_(True),
                BodyCheck.pelvic_heaviness.is_(True),
                BodyCheck.breast_pain.is_(True),
            ),
        ).limit(1)
    )

    sessions = db.scalar(
        select(ExerciseSession.id).where(
            ExerciseSession.user_id == user_id,
            ExerciseSession.completed_at >= datetime.combine(
                since,
                datetime.min.time(),
            ),
            or_(
                ExerciseSession.pain.is_(True),
                ExerciseSession.bleeding.is_(True),
                ExerciseSession.pelvic_heaviness.is_(True),
            ),
        ).limit(1)
    )

    return bool(body or sessions)


# --------------------------------------
# DELIVERY TYPE NORMALIZATION
# --------------------------------------

def normalize_delivery_type(value):
    """
    Onboarding stores:
        vaginal
        csection

    Older Recovery code uses:
        vaginal
        c_section

    Normalize both formats.
    """

    if value in ("csection", "c_section"):
        return "c_section"

    if value == "vaginal":
        return "vaginal"

    return None


# --------------------------------------
# EXERCISE ELIGIBILITY RULES
# --------------------------------------

def exercise_eligibility(
    exercise,
    context,
    paused,
):
    # 1. Recent symptoms
    if paused:
        return False, (
            "Activity guidance is paused after a recent "
            "symptom report. Please seek medical advice "
            "before resuming."
        )

    # 2. Onboarding profile must exist
    if context is None:
        return False, (
            "Complete your onboarding profile first."
        )

    # 3. Birth date from MotherProfile
    birth_date = getattr(
        context,
        "baby_birth_date",
        None,
    )

    if birth_date is None:
        return False, (
            "Baby's birth date is missing from your profile."
        )

    postpartum_days = (
        local_today() - birth_date
    ).days

    if postpartum_days < 0:
        return False, (
            "Birth date cannot be in the future."
        )

    postpartum_week = postpartum_days // 7

    # 4. Delivery type from MotherProfile
    delivery_type = normalize_delivery_type(
        getattr(
            context,
            "delivery_type",
            None,
        )
    )

    if delivery_type is None:
        return False, (
            "Delivery type is missing from your profile."
        )

    # 5. Minimum recovery week
    if postpartum_week < exercise.min_week:
        return False, (
            f"This activity is listed from week "
            f"{exercise.min_week} onward."
        )

    # 6. Delivery-specific eligibility
    allowed_delivery_types = [
        normalize_delivery_type(item)
        for item in (
            exercise.allowed_delivery_types or []
        )
    ]

    if delivery_type not in allowed_delivery_types:
        return False, (
            "This activity is not listed for your "
            "delivery type."
        )

    # 7. Activity restrictions from Profile Settings
    activity_limits = getattr(
        context,
        "activity_limits",
        None,
    )

    if activity_limits == "yes":
        return False, (
            "Your profile indicates activity restrictions. "
            "Please follow your healthcare professional's "
            "individual guidance."
        )

    # 8. Exercise clearance
    clearance_status = getattr(
        context,
        "exercise_cleared",
        "not_yet",
    )

    exercise_cleared = (
        clearance_status == "yes"
    )

    if exercise.needs_clearance and not exercise_cleared:
        return False, (
            "Professional exercise clearance is required "
            "before this activity can be unlocked."
        )

    # 9. Clinical content review
    if (
        not exercise.reviewed_by
        or not exercise.review_date
    ):
        return False, (
            "Awaiting clinical content review."
        )

    # 10. Eligible
    return True, None
