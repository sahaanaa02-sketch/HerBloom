
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.mother_profile import MotherProfile
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.onboarding import (
    OnboardingStep1,
    OnboardingStep2,
    OnboardingStep3,
    OnboardingStep4,
    OnboardingStep5,
    OnboardingProgressResponse,
    OnboardingCompleteResponse,
)


router = APIRouter(
    prefix="/profile",
    tags=["Mother Onboarding"],
)

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


STEP_FIELDS = {
    1: set(OnboardingStep1.model_fields),
    2: set(OnboardingStep2.model_fields),
    3: set(OnboardingStep3.model_fields),
    4: set(OnboardingStep4.model_fields),
    5: set(OnboardingStep5.model_fields),
}


class ProfileResponse(BaseModel):
    profile: dict
    onboarding_step: int
    onboarding_done: bool


def get_or_create_profile(
    db: Session,
    user: User,
) -> MotherProfile:
    if user.role != "MOTHER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only mothers can access onboarding.",
        )

    profile = (
        db.query(MotherProfile)
        .filter(MotherProfile.user_id == user.id)
        .first()
    )

    if profile is None:
        profile = MotherProfile(
            user_id=user.id,
            display_name=user.full_name,
            onboarding_step=1,
            onboarding_done=False,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return profile


def profile_to_dict(profile: MotherProfile) -> dict:
    result = {}

    for column in MotherProfile.__table__.columns:
        value = getattr(profile, column.name)

        if isinstance(value, (date,)):
            value = value.isoformat()

        result[column.name] = value

    return result


@router.get(
    "",
    response_model=ProfileResponse,
)
def get_profile(
    db: DbSession,
    current_user: CurrentUser,
):
    profile = get_or_create_profile(db, current_user)

    return {
        "profile": profile_to_dict(profile),
        "onboarding_step": profile.onboarding_step,
        "onboarding_done": profile.onboarding_done,
    }


def save_step_data(
    step: int,
    data: BaseModel,
    db: Session,
    current_user: User,
):
    profile = get_or_create_profile(db, current_user)

    if profile.onboarding_done:
        raise HTTPException(
            status_code=409,
            detail="Onboarding is already complete.",
        )

    values = data.model_dump()

    for field_name in STEP_FIELDS[step]:
        if field_name in values:
            setattr(profile, field_name, values[field_name])

    # Remove irrelevant birth-specific answers
    if step == 2:
        if profile.delivery_type == "vaginal":
            profile.csection_type = None

        elif profile.delivery_type == "csection":
            profile.perineal_tear = None
            profile.assisted_birth = None

    # Keep progress within 1–5.
    # Do not move backwards when editing an earlier step.
    profile.onboarding_step = max(
        profile.onboarding_step,
        min(step + 1, 5),
    )

    db.commit()
    db.refresh(profile)

    return {
        "onboarding_step": profile.onboarding_step,
        "onboarding_done": profile.onboarding_done,
    }


@router.patch(
    "/onboarding/1",
    response_model=OnboardingProgressResponse,
)
def save_step_1(
    data: OnboardingStep1,
    db: DbSession,
    current_user: CurrentUser,
):
    return save_step_data(1, data, db, current_user)


@router.patch(
    "/onboarding/2",
    response_model=OnboardingProgressResponse,
)
def save_step_2(
    data: OnboardingStep2,
    db: DbSession,
    current_user: CurrentUser,
):
    return save_step_data(2, data, db, current_user)


@router.patch(
    "/onboarding/3",
    response_model=OnboardingProgressResponse,
)
def save_step_3(
    data: OnboardingStep3,
    db: DbSession,
    current_user: CurrentUser,
):
    return save_step_data(3, data, db, current_user)


@router.patch(
    "/onboarding/4",
    response_model=OnboardingProgressResponse,
)
def save_step_4(
    data: OnboardingStep4,
    db: DbSession,
    current_user: CurrentUser,
):
    return save_step_data(4, data, db, current_user)


@router.patch(
    "/onboarding/5",
    response_model=OnboardingProgressResponse,
)
def save_step_5(
    data: OnboardingStep5,
    db: DbSession,
    current_user: CurrentUser,
):
    return save_step_data(5, data, db, current_user)


@router.post(
    "/onboarding/complete",
    response_model=OnboardingCompleteResponse,
)
def complete_onboarding(
    db: DbSession,
    current_user: CurrentUser,
):
    profile = get_or_create_profile(db, current_user)

    if profile.baby_birth_date is None:
        raise HTTPException(
            status_code=422,
            detail="Baby's birth date is required.",
        )

    if profile.baby_birth_date > date.today():
        raise HTTPException(
            status_code=422,
            detail="Baby's birth date cannot be in the future.",
        )

    if profile.delivery_type not in ("vaginal", "csection"):
        raise HTTPException(
            status_code=422,
            detail="Delivery type is required.",
        )

    profile.onboarding_done = True
    profile.onboarding_step = 5

    db.commit()

    return {
        "message": "Onboarding completed successfully.",
        "onboarding_done": True,
    }
