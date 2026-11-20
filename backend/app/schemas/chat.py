
from typing import Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    session_id: int | None = None
    article_id: int | None = Field(default=None, ge=1)
    text: str = Field(min_length=1, max_length=1500)
    lang: Literal["en", "ta"] = "en"


class FeedbackRequest(BaseModel):
    helpful: bool
    share_content: bool = Field(False, strict=True)


class ConsentRequest(BaseModel):
    enabled: bool
