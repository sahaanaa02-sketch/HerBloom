
from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MealType = Literal[
    "breakfast",
    "morning_snack",
    "lunch",
    "evening_snack",
    "dinner",
]


class FoodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name_en: str
    name_ta: str | None = None
    category: str
    calories: float
    protein: float
    iron: float
    calcium: float
    source: str
    verified: bool


class FoodLogCreate(BaseModel):
    food_id: int = Field(gt=0)
    meal_type: MealType
    grams: float = Field(gt=0, le=3000)
    date: Date | None = None


class FoodLogUpdate(BaseModel):
    food_id: int | None = Field(default=None, gt=0)
    meal_type: MealType | None = None
    grams: float | None = Field(default=None, gt=0, le=3000)


class HbCreate(BaseModel):
    value: float = Field(gt=0, le=30)
    date: Date | None = None


class PlanItemUpdate(BaseModel):
    eaten: bool


class ScanItem(BaseModel):
    name: str
    estimated_grams: float = Field(gt=0, le=3000)
    confidence: Literal["low", "medium", "high"] = "low"


class ScanResponse(BaseModel):
    items: list[ScanItem]
    message: str
