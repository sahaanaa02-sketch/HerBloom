from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict


Category = Literal[
    "breastfeeding",
    "baby_care",
    "recovery",
    "traditional",
    "pelvic",
    "faq",
    "cycle",
]


class ArticleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    category: str
    title_en: str
    title_ta: str
    body_en: str
    body_ta: str
    image_url: str | None
    read_time: int
    key_points_en: list[str]
    key_points_ta: list[str]
    doctor_note_en: str | None
    doctor_note_ta: str | None
    reviewed_by: str | None
    review_date: date | None
    min_week: int | None
    max_week: int | None
    delivery_type: str
    safety_label: str | None
    published: bool


class ArticleList(BaseModel):
    items: list[ArticleOut]
    total: int
