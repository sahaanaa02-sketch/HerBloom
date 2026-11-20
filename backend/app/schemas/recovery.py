
from datetime import date, time
from typing import Literal

from pydantic import BaseModel, Field, ConfigDict


class RecoveryContextIn(BaseModel):
    birth_date: date
    delivery_type: Literal["vaginal", "c_section"]


class SleepIn(BaseModel):
    date: date
    bed_time: time
    wake_time: time
    quality: int = Field(ge=1, le=5)
    wakings: int = Field(default=0, ge=0, le=100)
    note: str = Field(default="", max_length=2000)


class WalkIn(BaseModel):
    date: date
    minutes: int = Field(ge=1, le=300)
    note: str = Field(default="", max_length=1000)


class BodyCheckIn(BaseModel):
    date: date
    wound: bool = False
    bleeding_level: Literal[
        "none", "light", "moderate", "heavy"
    ] = "none"
    back_pain: bool = False
    pelvic_heaviness: bool = False
    urine_leakage: bool = False
    breast_pain: bool = False
    energy: int = Field(default=3, ge=1, le=5)
    note: str = Field(default="", max_length=3000)


class ExerciseSessionIn(BaseModel):
    exercise_id: int
    feeling: Literal["easy", "ok", "hard"]
    pain: bool = False
    bleeding: bool = False
    pelvic_heaviness: bool = False
    note: str = Field(default="", max_length=2000)


class RowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
