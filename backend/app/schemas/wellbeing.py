
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict


Frequency = Literal[0, 1, 2, 3]


class CheckinCreate(BaseModel):
    # Six frequency/support answers plus one safety response
    answers: list[int] = Field(min_length=6, max_length=6)
    safety_concern: bool

    # Explicitly requested support, independent of scoring
    request_support: bool = False


class JournalCreate(BaseModel):
    prompt: str = Field(default="", max_length=255)
    content: str = Field(min_length=1, max_length=10000)
    gratitude: str = Field(default="", max_length=2000)
    mood_tag: str = Field(default="", max_length=30)


class ActivityComplete(BaseModel):
    activity_id: int = Field(gt=0)


class JournalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    prompt: str
    content: str
    gratitude: str
    mood_tag: str
