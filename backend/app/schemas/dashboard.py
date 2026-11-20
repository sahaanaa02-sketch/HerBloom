
from datetime import date as Date, datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


# ----------------------------------------
# COMMON CONFIGURATION
# ----------------------------------------

class DashboardBaseSchema(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
    )


# ----------------------------------------
# HYDRATION SCHEMAS
# ----------------------------------------

class HydrationAdd(BaseModel):
    glasses: int = Field(
        default=1,
        ge=1,
        le=20,
        description="Number of glasses to add",
    )


class HydrationSet(BaseModel):
    glasses: int = Field(
        ge=0,
        le=50,
        description="Total glasses recorded for today",
    )


class HydrationResponse(DashboardBaseSchema):
    id: int
    user_id: int
    date: Date
    glasses: int
    created_at: datetime
    updated_at: datetime


# ----------------------------------------
# TODO SCHEMAS
# ----------------------------------------

class TodoCreate(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=200,
    )

    date: Date | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError(
                "Task title cannot be empty."
            )

        return value


class TodoUpdate(BaseModel):
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )

    done: bool | None = None

    @field_validator("title")
    @classmethod
    def validate_title(
        cls,
        value: str | None,
    ) -> str | None:

        if value is None:
            return None

        value = value.strip()

        if not value:
            raise ValueError(
                "Task title cannot be empty."
            )

        return value


class TodoResponse(DashboardBaseSchema):
    id: int
    user_id: int
    title: str
    date: Date
    done: bool
    created_at: datetime
    updated_at: datetime


# ----------------------------------------
# REMINDER SCHEMAS
# ----------------------------------------

class ReminderCreate(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=200,
    )

    description: str | None = None

    remind_at: datetime

    @field_validator("title")
    @classmethod
    def validate_title(
        cls,
        value: str,
    ) -> str:

        value = value.strip()

        if not value:
            raise ValueError(
                "Reminder title cannot be empty."
            )

        return value

    @field_validator("remind_at")
    @classmethod
    def validate_reminder_time(
        cls,
        value: datetime,
    ) -> datetime:

        if value.tzinfo is not None:
            raise ValueError(
                "Use local Sri Lanka date and time without timezone."
            )

        return value


class ReminderUpdate(BaseModel):
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )

    description: str | None = None

    remind_at: datetime | None = None

    completed: bool | None = None

    @field_validator("title")
    @classmethod
    def validate_title(
        cls,
        value: str | None,
    ) -> str | None:

        if value is None:
            return None

        value = value.strip()

        if not value:
            raise ValueError(
                "Reminder title cannot be empty."
            )

        return value

    @field_validator("remind_at")
    @classmethod
    def validate_reminder_time(
        cls,
        value: datetime | None,
    ) -> datetime | None:

        if (
            value is not None
            and value.tzinfo is not None
        ):
            raise ValueError(
                "Use local Sri Lanka date and time without timezone."
            )

        return value


class ReminderResponse(DashboardBaseSchema):
    id: int
    user_id: int
    title: str
    description: str | None
    remind_at: datetime
    completed: bool
    created_at: datetime
    updated_at: datetime


# ----------------------------------------
# POSTPARTUM STAGE RESPONSE
# ----------------------------------------

class DashboardStageResponse(BaseModel):
    configured: bool = False

    postpartum_day: int | None = None
    postpartum_week: int | None = None

    delivery_type: str | None = None

    birth_date: Date | None = None

    message: str | None = None


# ----------------------------------------
# TODAY OVERVIEW RESPONSE
# ----------------------------------------

class DashboardTodayResponse(BaseModel):
    date: Date

    walk_minutes: int | None = None
    sleep_hours: float | None = None

    water_glasses: int = 0
    meals_logged: int | None = None

    alerts: list = Field(
        default_factory=list,
    )

    weekly_summary: dict | None = None


# ----------------------------------------
# WEEKLY SNAPSHOT RESPONSE
# ----------------------------------------

class DashboardWeeklyResponse(BaseModel):
    start_date: Date
    end_date: Date

    total_walk_minutes: int = 0
    total_sleep_hours: float = 0

    average_sleep_hours: float | None = None

    total_water_glasses: int = 0

    completed_tasks: int = 0
    total_tasks: int = 0

    walking_days: int = 0
