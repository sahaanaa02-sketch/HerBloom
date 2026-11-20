import re
from typing import Annotated, Literal
from urllib.parse import parse_qs, urlsplit

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

ExerciseCategory = Literal[
    "pelvic_floor", "breathing", "gentle_core", "posture_back", "stretching", "walking"
]
Step = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
DeliveryType = Literal["vaginal", "csection"]
YOUTUBE_ID = re.compile(r"[A-Za-z0-9_-]{11}")


def youtube_video_id(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme != "https":
        raise ValueError("Use a valid HTTPS YouTube video link.")

    parts = parsed.path.strip("/").split("/")
    video = ""
    if parsed.netloc.lower() == "youtu.be" and len(parts) == 1:
        video = parts[0]
    elif parsed.netloc.lower() in ("youtube.com", "www.youtube.com", "m.youtube.com"):
        if parsed.path == "/watch":
            ids = parse_qs(parsed.query).get("v", [])
            video = ids[0] if len(ids) == 1 else ""
        elif len(parts) == 2 and parts[0] in ("shorts", "embed"):
            video = parts[1]

    if not YOUTUBE_ID.fullmatch(video):
        raise ValueError("Use a valid HTTPS YouTube video link.")
    return video


class ExerciseDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=150)
    name_ta: str | None = Field(default=None, max_length=150)
    category: ExerciseCategory
    level: str = Field(default="Gentle", min_length=1, max_length=30)
    steps: list[Step] = Field(default_factory=list, max_length=50)
    steps_ta: list[Step] | None = Field(default=None, max_length=50)
    duration_minutes: int = Field(ge=1, le=1440, strict=True)
    repetitions: int | None = Field(default=None, ge=1, le=10000, strict=True)
    equipment: str = Field(default="", max_length=200)
    min_week: int = Field(default=0, ge=0, le=520, strict=True)
    allowed_delivery_types: list[DeliveryType] = Field(min_length=1, max_length=2)
    needs_clearance: bool = True
    safety_notes: str = Field(default="", max_length=15000)
    safety_notes_ta: str | None = Field(default=None, max_length=15000)
    contraindications: str = Field(default="", max_length=15000)
    contraindications_ta: str | None = Field(default=None, max_length=15000)
    is_premium: bool = False
    image_media_id: int | None = Field(default=None, ge=1, le=2147483647)
    video_url: str | None = Field(default=None, max_length=500)

    @field_validator("video_url")
    @classmethod
    def normalize_video(cls, url: str | None):
        return f"https://www.youtube.com/watch?v={youtube_video_id(url)}" if url else None

    @model_validator(mode="after")
    def validate_pairs_and_delivery(self):
        if len(set(self.allowed_delivery_types)) != len(self.allowed_delivery_types):
            raise ValueError("Select each delivery type only once.")
        if self.steps_ta is None:
            self.steps_ta = [""] * len(self.steps)
        if len(self.steps) != len(self.steps_ta):
            raise ValueError("English and Tamil steps must be saved in paired rows.")
        return self
