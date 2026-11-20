from datetime import date, datetime
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.mother_profile import MotherProfile
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.profile import (
    ProfileUpdate,
    ProfileUpdateResponse,
)


router = APIRouter(
    prefix="/profile",
    tags=["Mother Profile & Settings"],
)

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[
    User,
    Depends(get_current_user),
]


@router.put(
    "",
    response_model=ProfileUpdateResponse,
)
def update_profile(
    data: ProfileUpdate,
    db: DbSession,
    current_user: CurrentUser,
):
    if current_user.role != "MOTHER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only mothers can edit their profile.",
        )

    profile = (
        db.query(MotherProfile)
        .filter(MotherProfile.user_id == current_user.id)
        .first()
    )

    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="Mother profile not found.",
        )

    changes = data.model_dump(exclude_unset=True)

    # Update User table
    if "full_name" in changes:
        current_user.full_name = changes.pop("full_name")

    # Update MotherProfile table
    for field_name, value in changes.items():
        setattr(profile, field_name, value)

    # Delivery-specific information
    if profile.delivery_type == "vaginal":
        profile.csection_type = None

    elif profile.delivery_type == "csection":
        profile.perineal_tear = None
        profile.assisted_birth = None

    # Anaemia follow-up
    if profile.anaemia != "yes":
        profile.hb_value = None
        profile.hb_month = None
        profile.iron_prescribed = None

    # Gestational diabetes follow-up
    if profile.gdm_history != "yes":
        profile.gdm_test_status = None
        profile.gdm_result = None
        profile.gdm_test_month = None

    elif profile.gdm_test_status != "yes":
        profile.gdm_result = None
        profile.gdm_test_month = None

    # Blood pressure follow-up
    if profile.high_bp != "yes":
        profile.bp_medicine = None

    # Exercise clearance
    if profile.exercise_cleared != "yes":
        profile.exercise_cleared_month = None

    if profile.activity_limits != "yes":
        profile.activity_limits_note = None

    # Reminder preferences
    if profile.reminders is not None:
        profile.reminders = list(
            dict.fromkeys(profile.reminders)
        )

    # Save both User and MotherProfile together
    try:
        db.commit()
        db.refresh(profile)
        db.refresh(current_user)
    except Exception:
        db.rollback()
        raise

    result = {}

    for column in MotherProfile.__table__.columns:
        value = getattr(profile, column.name)

        if isinstance(value, (date, datetime)):
            value = value.isoformat()

        result[column.name] = value

    result["full_name"] = current_user.full_name
    result["email"] = current_user.email

    return {
        "message": "Profile updated successfully.",
        "profile": result,
    }