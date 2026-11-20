from datetime import date
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.schemas.onboarding import YesNoUnsure, Month


Reminder = Literal[
    "water",
    "rest",
    "mood",
    "meals",
    "exercises",
    "medicine",
    "appointments",
    "gdm_test",
]


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # 1. Personal Information
    full_name: str | None = Field(
        default=None, min_length=1, max_length=150
    )
    display_name: str | None = Field(
        default=None, max_length=150
    )

    # 2. Recovery Profile
    baby_birth_date: date | None = None
    babies_count: Literal[1, 2, 3] | None = None
    first_baby: bool | None = None

    delivery_type: Literal[
        "vaginal", "csection"
    ] | None = None

    perineal_tear: YesNoUnsure | None = None

    assisted_birth: Literal[
        "none", "vacuum", "forceps", "not_sure"
    ] | None = None

    csection_type: Literal[
        "planned", "unplanned", "undisclosed"
    ] | None = None

    feeding_method: Literal[
        "breast", "formula", "both", "undisclosed"
    ] | None = None

    # 3. Health Conditions
    anaemia: YesNoUnsure | None = None
    gdm_history: YesNoUnsure | None = None
    high_bp: YesNoUnsure | None = None
    thyroid: YesNoUnsure | None = None

    hb_value: float | None = Field(
        default=None, gt=0, le=30
    )
    hb_month: Month | None = None
    iron_prescribed: YesNoUnsure | None = None
    bp_medicine: YesNoUnsure | None = None

    mental_health_history: Literal[
        "yes", "no", "undisclosed"
    ] | None = None

    other_health_note: str | None = Field(
        default=None, max_length=1000
    )

    # 4. GDM Follow-up
    gdm_test_status: Literal[
        "yes", "booked", "not_yet", "not_sure"
    ] | None = None

    gdm_result: Literal[
        "normal",
        "prediabetes",
        "diabetes",
        "not_told_yet",
    ] | None = None

    gdm_test_month: Month | None = None

    # 5. Exercise Clearance
    exercise_cleared: Literal[
        "yes", "not_yet", "not_sure"
    ] | None = None

    exercise_cleared_month: Month | None = None
    activity_limits: YesNoUnsure | None = None

    activity_limits_note: str | None = Field(
        default=None, max_length=1000
    )

    # 6. Reminders & Notifications
    reminders: list[Reminder] | None = None

    quiet_from: str | None = Field(
        default=None,
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
    )
    quiet_to: str | None = Field(
        default=None,
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
    )

    care_contact_name: str | None = Field(
        default=None, max_length=150
    )
    care_contact_phone: str | None = Field(
        default=None, max_length=30
    )

    # 7. Language
    language: Literal["en", "ta"] | None = None

    # 8. Privacy & Account
    consent_ai_profile: bool | None = None

    @field_validator("baby_birth_date")
    @classmethod
    def validate_birth_date(cls, value):
        if value is not None and value > date.today():
            raise ValueError(
                "Baby's birth date cannot be in the future."
            )
        return value

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError(
                    "Full name cannot be empty."
                )
        return value

    @field_validator("reminders")
    @classmethod
    def unique_reminders(cls, value):
        if value is None:
            return None
        return list(dict.fromkeys(value))

    @model_validator(mode="after")
    def validate_profile_fields(self):
        required_when_supplied = [
            "full_name",
            "baby_birth_date",
            "babies_count",
            "delivery_type",
            "exercise_cleared",
            "language",
            "quiet_from",
            "quiet_to",
            "consent_ai_profile",
        ]

        for field in required_when_supplied:
            if (
                field in self.model_fields_set
                and getattr(self, field) is None
            ):
                raise ValueError(
                    f"{field} cannot be null."
                )

        return self


class ProfileUpdateResponse(BaseModel):
    message: str
    profile: dict