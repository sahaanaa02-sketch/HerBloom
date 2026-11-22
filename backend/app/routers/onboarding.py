import json

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.mother_profile import MotherProfile
from app.models.user import User
from app.routers.auth import require_mother
from app.services.user_privacy import now
from app.schemas.onboarding import (
    OnboardingStep1,
    OnboardingStep2,
    OnboardingStep3,
    OnboardingStep4,
    OnboardingStep5,
    OnboardingProgressResponse,
    OnboardingCompleteResponse,
    OnboardingBirthV2,
    OnboardingHealthV2,
    OnboardingPreferencesV2,
    OnboardingConsentV2,
)


router = APIRouter(
    prefix="/profile",
    tags=["Mother Onboarding"],
)

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(require_mother)]


STEP_FIELDS = {
    1: set(OnboardingStep1.model_fields),
    2: set(OnboardingStep2.model_fields),
    3: set(OnboardingStep3.model_fields),
    4: set(OnboardingStep4.model_fields),
    5: set(OnboardingStep5.model_fields),
}


V2_SCHEMAS = {
    1: OnboardingStep1,
    2: OnboardingBirthV2,
    3: OnboardingHealthV2,
    4: OnboardingPreferencesV2,
    5: OnboardingConsentV2,
}
V2_ANSWERS = {
    "previous_csection", "postpartum_complications", "recovery_concerns",
    "feature_interests", "daily_reminder_time",
}


def v2_available(db):
    return bool(db.connection().exec_driver_sql(
        "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() "
        "AND TABLE_NAME='mother_profiles' AND COLUMN_NAME='onboarding_v2'"
    ).scalar())


def v2_state(db, profile, *, locked=False):
    # Legacy steps 3?5 used different sections. Preserve answers and earned
    # progress, but revisit the combined Health and Feeding step.
    baseline = {"resume_step": min(profile.onboarding_step or 1, 3)}
    if profile.id is None:
        return baseline
    suffix = " FOR UPDATE" if locked else ""
    raw = db.connection().exec_driver_sql(
        "SELECT onboarding_v2 FROM mother_profiles WHERE id=%s" + suffix, (profile.id,)
    ).scalar()
    return json.loads(raw) if raw is not None else baseline


class ProfileResponse(BaseModel):
    profile: dict
    onboarding_step: int
    onboarding_done: bool
    onboarding_resume_step: int | None = None
    onboarding_version: int | None = None


def get_or_create_profile(
    db: Session,
    user: User,
    *,
    for_write: bool = False,
) -> MotherProfile:
    query = select(MotherProfile).where(MotherProfile.user_id == user.id)
    if not for_write:
        profile = db.scalar(query)
        if profile is not None:
            return profile

    # Serialize creation and updates for this mother, including first-time saves.
    db.execute(select(User.id).where(User.id == user.id).with_for_update()).scalar_one()
    profile = db.scalar(query.with_for_update())

    if profile is None:
        profile = MotherProfile(
            user_id=user.id,
            display_name=user.full_name,
            onboarding_step=1,
            onboarding_done=False,
        )
        db.add(profile)
        if not for_write:
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
    response_model_exclude_none=True,
)
def get_profile(
    db: DbSession,
    current_user: CurrentUser,
):
    profile = get_or_create_profile(db, current_user)

    result = {
        "profile": profile_to_dict(profile),
        "onboarding_step": profile.onboarding_step,
        "onboarding_done": profile.onboarding_done,
    }
    if v2_available(db):
        state = v2_state(db, profile)
        result["onboarding_version"] = 2
        result["onboarding_resume_step"] = 5 if profile.onboarding_done else state["resume_step"]
        result["profile"].update({key: state[key] for key in V2_ANSWERS if key in state})
        result["profile"]["onboarding_consent"] = bool(state.get("consented_at"))
    return result


def save_step_data(
    step: int,
    data: BaseModel,
    db: Session,
    current_user: User,
):
    if v2_available(db):
        raise HTTPException(409, "Refresh onboarding to use the current questionnaire.")
    profile = get_or_create_profile(db, current_user, for_write=True)

    if profile.onboarding_done:
        raise HTTPException(
            status_code=409,
            detail="Onboarding is already complete.",
        )

    if step > profile.onboarding_step:
        raise HTTPException(409, "Complete the earlier onboarding steps first.")

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


@router.patch("/onboarding/v2/{step}", response_model=OnboardingProgressResponse)
def save_step_v2(step: int, db: DbSession, current_user: CurrentUser, payload: dict = Body()):
    if step not in V2_SCHEMAS:
        raise HTTPException(404, "Onboarding step not found.")
    if not v2_available(db):
        raise HTTPException(503, "This onboarding version is unavailable.")
    profile = get_or_create_profile(db, current_user, for_write=True)
    if profile.onboarding_done:
        raise HTTPException(409, "Onboarding is already complete.")
    state = v2_state(db, profile, locked=True)
    if step > state["resume_step"]:
        raise HTTPException(409, "Complete the earlier onboarding steps first.")

    try:
        values = V2_SCHEMAS[step].model_validate(payload).model_dump()
    except ValidationError as error:
        raise RequestValidationError([
            {**issue, "loc": ("body", *issue["loc"])}
            for issue in error.errors(include_context=False, include_input=False, include_url=False)
        ]) from None

    if step < 5:
        state.pop("consented_at", None)
    else:
        values.pop("onboarding_consent")
        state.setdefault("consented_at", now().isoformat(timespec="seconds") + "Z")

    for key, value in values.items():
        if key in V2_ANSWERS:
            state[key] = list(dict.fromkeys(value)) if isinstance(value, list) else value
        else:
            setattr(profile, key, value)
    if profile.first_baby is True:
        state["previous_csection"] = None
    state["resume_step"] = max(state["resume_step"], min(step + 1, 5))
    profile.onboarding_step = max(profile.onboarding_step or 1, state["resume_step"])
    db.flush()
    db.connection().exec_driver_sql(
        "UPDATE mother_profiles SET onboarding_v2=%s WHERE id=%s", (json.dumps(state), profile.id)
    )
    db.commit()
    return {"onboarding_step": profile.onboarding_step, "onboarding_done": False}


@router.post(
    "/onboarding/complete",
    response_model=OnboardingCompleteResponse,
)
def complete_onboarding(
    db: DbSession,
    current_user: CurrentUser,
):
    profile = get_or_create_profile(db, current_user, for_write=True)

    result = {"message": "Onboarding completed successfully.", "onboarding_done": True}
    if profile.onboarding_done:
        return result
    if v2_available(db):
        state = v2_state(db, profile, locked=True)
        if state["resume_step"] != 5 or not state.get("consented_at"):
            raise HTTPException(409, "Save all onboarding steps and confirm consent before finishing.")
    elif profile.onboarding_step != 5 or profile.reminders is None:
        raise HTTPException(409, "Save all onboarding steps before finishing.")

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

    return result
