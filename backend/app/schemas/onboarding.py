
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# -----------------------------
# Shared types
# -----------------------------

YesNoUnsure = Literal["yes", "no", "not_sure"]
HealthStatus = Literal["yes", "no", "not_sure"]

Month = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


# -----------------------------
# STEP 1 — About you and baby
# -----------------------------

class OnboardingStep1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=150)
    baby_birth_date: date
    babies_count: Literal[1, 2, 3] = 1
    first_baby: bool | None = None

    @field_validator("baby_birth_date")
    @classmethod
    def validate_birth_date(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Baby's birth date cannot be in the future.")
        return value


# -----------------------------
# STEP 2 — Your birth
# -----------------------------

class OnboardingStep2(BaseModel):
    model_config = ConfigDict(extra="forbid")

    delivery_type: Literal["vaginal", "csection"]

    # Vaginal birth
    perineal_tear: YesNoUnsure | None = None
    assisted_birth: Literal[
        "none", "vacuum", "forceps", "not_sure"
    ] | None = None

    # C-section
    csection_type: Literal[
        "planned", "unplanned", "undisclosed"
    ] | None = None

    # Exercise and activity
    exercise_cleared: Literal[
        "yes", "not_yet", "not_sure"
    ] = "not_yet"

    exercise_cleared_month: Month | None = None

    activity_limits: YesNoUnsure | None = None
    activity_limits_note: str | None = Field(
        default=None, max_length=1000
    )

    @model_validator(mode="after")
    def validate_delivery_questions(self):
        if self.delivery_type == "vaginal":
            if self.csection_type is not None:
                raise ValueError(
                    "C-section answers cannot be sent for vaginal birth."
                )

        if self.delivery_type == "csection":
            if self.perineal_tear is not None:
                raise ValueError(
                    "Vaginal birth answers cannot be sent for C-section."
                )
            if self.assisted_birth is not None:
                raise ValueError(
                    "Assisted vaginal birth cannot be sent for C-section."
                )

        if self.exercise_cleared != "yes":
            self.exercise_cleared_month = None

        if self.activity_limits != "yes":
            self.activity_limits_note = None

        return self


# -----------------------------
# STEP 3 — Feeding and food
# -----------------------------

Allergy = Literal[
    "peanuts",
    "shellfish",
    "fish",
    "eggs",
    "milk",
    "wheat",
    "soy",
    "other",
]

AvoidFood = Literal[
    "beef",
    "pork",
    "very_spicy",
    "other",
]


class OnboardingStep3(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feeding_method: Literal[
        "breast", "formula", "both", "undisclosed"
    ] | None = None

    diet_type: Literal[
        "all", "pescatarian", "vegetarian", "vegan"
    ] | None = None

    allergies: list[Allergy] | None = None
    avoid_foods: list[AvoidFood] | None = None

    @field_validator("allergies", "avoid_foods")
    @classmethod
    def remove_duplicates(cls, value):
        if value is None:
            return None
        return list(dict.fromkeys(value))


# -----------------------------
# STEP 4 — Your health
# -----------------------------

class OnboardingStep4(BaseModel):
    model_config = ConfigDict(extra="forbid")

    anaemia: HealthStatus | None = None
    gdm_history: HealthStatus | None = None
    high_bp: HealthStatus | None = None
    thyroid: HealthStatus | None = None

    hb_value: float | None = Field(
        default=None, gt=0, le=30
    )
    hb_month: Month | None = None
    iron_prescribed: YesNoUnsure | None = None

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

    bp_medicine: YesNoUnsure | None = None

    mental_health_history: Literal[
        "yes", "no", "undisclosed"
    ] = "undisclosed"

    other_health_note: str | None = Field(
        default=None, max_length=1000
    )

    @model_validator(mode="after")
    def validate_health_followups(self):
        if self.anaemia != "yes":
            self.hb_value = None
            self.hb_month = None
            self.iron_prescribed = None

        if self.gdm_history != "yes":
            self.gdm_test_status = None
            self.gdm_result = None
            self.gdm_test_month = None

        elif self.gdm_test_status != "yes":
            self.gdm_result = None
            self.gdm_test_month = None

        if self.high_bp != "yes":
            self.bp_medicine = None

        return self


# -----------------------------
# STEP 5 — Preferences/privacy
# -----------------------------

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


class OnboardingPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: Literal["en", "ta"] = "en"

    reminders: list[Reminder] = Field(
        default_factory=lambda: ["water", "mood"]
    )

    quiet_from: str = Field(
        default="22:00",
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
    )

    quiet_to: str = Field(
        default="06:00",
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
    )

    care_contact_name: str | None = Field(
        default=None, max_length=150
    )

    care_contact_phone: str | None = Field(
        default=None, max_length=30
    )

    @field_validator("reminders")
    @classmethod
    def unique_reminders(cls, value):
        return list(dict.fromkeys(value))


class OnboardingStep5(OnboardingPreferences):
    consent_ai_profile: Annotated[bool, Field(strict=True)]


class OnboardingBirthV2(OnboardingStep2):
    previous_csection: YesNoUnsure | None = None


class OnboardingHealthV2(OnboardingStep3, OnboardingStep4):
    postpartum_complications: list[Literal["bleeding", "wound", "infection", "blood_pressure", "other"]] = Field(
        default_factory=list, max_length=5
    )


class OnboardingPreferencesV2(OnboardingPreferences):
    recovery_concerns: list[Literal["comfort", "movement", "rest", "feeding", "wellbeing", "other"]] = Field(
        default_factory=list, max_length=6
    )
    feature_interests: list[Literal["recovery", "nutrition", "wellbeing", "education", "reminders"]] = Field(
        default_factory=list, max_length=5
    )
    daily_reminder_time: Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")] | None = None


class OnboardingConsentV2(BaseModel):
    model_config = ConfigDict(extra="forbid")

    onboarding_consent: Annotated[bool, Field(strict=True)]
    consent_ai_profile: Annotated[bool, Field(strict=True)]

    @field_validator("onboarding_consent")
    @classmethod
    def require_consent(cls, value):
        if not value:
            raise ValueError("Please confirm your onboarding consent.")
        return value


# -----------------------------
# Response schemas
# -----------------------------

class OnboardingProgressResponse(BaseModel):
    onboarding_step: int = Field(ge=1, le=5)
    onboarding_done: bool


class OnboardingCompleteResponse(BaseModel):
    message: str
    onboarding_done: bool
