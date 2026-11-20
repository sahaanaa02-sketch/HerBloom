from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Enum, Float, ForeignKey,
    Index, Integer, JSON, Numeric, String, Text, UniqueConstraint, func, inspect
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.admin import AdminUser
from app.models.media import MediaFile


class Food(Base):
    __tablename__ = "foods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(150), unique=True)
    name_ta: Mapped[str | None] = mapped_column(String(150))
    category: Mapped[str] = mapped_column(String(60), default="other")
    calories: Mapped[float] = mapped_column(Float, default=0)
    protein: Mapped[float] = mapped_column(Float, default=0)
    iron: Mapped[float] = mapped_column(Float, default=0)
    calcium: Mapped[float] = mapped_column(Float, default=0)
    source: Mapped[str] = mapped_column(String(150), default="unverified")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (Index("uq_a4_food_source_ref", "source", "source_ref", unique=True),)
    source_ref: Mapped[str | None] = mapped_column(String(250), deferred=True, deferred_group="a4")
    carbs_g: Mapped[float | None] = mapped_column(Float, deferred=True, deferred_group="a4")
    fat_g: Mapped[float | None] = mapped_column(Float, deferred=True, deferred_group="a4")
    fibre_g: Mapped[float | None] = mapped_column(Float, deferred=True, deferred_group="a4")
    folate_ug: Mapped[float | None] = mapped_column(Float, deferred=True, deferred_group="a4")
    vitamin_c_mg: Mapped[float | None] = mapped_column(Float, deferred=True, deferred_group="a4")
    tags: Mapped[list | None] = mapped_column(JSON, deferred=True, deferred_group="a4")
    missing_nutrients: Mapped[list | None] = mapped_column(JSON, deferred=True, deferred_group="a4")


class FoodAlias(Base):
    __tablename__ = "food_aliases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    food_id: Mapped[int] = mapped_column(
        ForeignKey("foods.id", ondelete="CASCADE"), index=True
    )
    alias: Mapped[str] = mapped_column(String(150), index=True)
    lang: Mapped[str | None] = mapped_column(Enum("en", "ta", "local"), deferred=True)


class UnmatchedFoodName(Base):
    __tablename__ = "unmatched_food_names"
    __table_args__ = (UniqueConstraint("name", name="uq_unmatched_food_name"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150, collation="utf8mb4_bin"))
    count: Mapped[int] = mapped_column(Integer)
    last_seen: Mapped[datetime] = mapped_column(DateTime)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)


class NutritionTargetValue(Base):
    __tablename__ = "nutrition_target_values"
    __table_args__ = (
        UniqueConstraint("feeding_group", "nutrient", name="uq_nutrition_target_value"),
        CheckConstraint("value > 0", name="ck_nutrition_target_value_positive"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feeding_group: Mapped[str] = mapped_column(Enum("breastfeeding", "not_breastfeeding"))
    nutrient: Mapped[str] = mapped_column(Enum(
        "calories", "protein", "carbs_g", "fat_g", "fibre_g", "iron", "calcium", "folate_ug", "vitamin_c_mg"
    ))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(10))
    source_note: Mapped[str] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(Enum("draft", "in_review", "approved"))
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey(AdminUser.__table__.c.id, name="fk_nutrition_target_value_reviewer", ondelete="SET NULL")
    )


class MealIdea(Base):
    __tablename__ = "meal_ideas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40), default="lunch")
    ingredients: Mapped[list] = mapped_column(JSON, default=list)
    tags: Mapped[list] = mapped_column(JSON, default=list)

    title_ta: Mapped[str | None] = mapped_column(String(150))
    description_ta: Mapped[str | None] = mapped_column(Text)
    allergens: Mapped[list | None] = mapped_column(JSON)
    photo_media_id: Mapped[int | None] = mapped_column(
        ForeignKey(MediaFile.__table__.c.id, name="fk_meal_ideas_photo", ondelete="SET NULL")
    )
    editorial_status: Mapped[str | None] = mapped_column(Enum("draft", "in_review", "archived", "published"))
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey(AdminUser.__table__.c.id, name="fk_meal_ideas_created_by", ondelete="SET NULL")
    )
    updated_by: Mapped[int | None] = mapped_column(
        ForeignKey(AdminUser.__table__.c.id, name="fk_meal_ideas_updated_by", ondelete="SET NULL")
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


MEAL_EDITORIAL_COLUMNS = {
    "title_ta", "description_ta", "allergens", "photo_media_id", "editorial_status",
    "created_by", "updated_by", "created_at", "updated_at",
}


def meal_idea_columns(db):
    return {column["name"] for column in inspect(db.connection()).get_columns("meal_ideas")}


class MealIdeaIngredient(Base):
    __tablename__ = "meal_idea_ingredients"
    __table_args__ = (
        Index("ix_meal_idea_ingredients_food_id", "food_id"),
        CheckConstraint("grams > 0", name="ck_meal_idea_ingredients_positive_grams"),
    )
    meal_idea_id: Mapped[int] = mapped_column(
        ForeignKey("meal_ideas.id", name="fk_meal_idea_ingredients_meal", ondelete="CASCADE"),
        primary_key=True,
    )
    food_id: Mapped[int] = mapped_column(
        ForeignKey("foods.id", name="fk_meal_idea_ingredients_food", ondelete="RESTRICT"),
        primary_key=True,
    )
    grams: Mapped[Decimal] = mapped_column(Numeric(10, 2))


class NutritionTarget(Base):
    __tablename__ = "nutrition_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feeding_method: Mapped[str] = mapped_column(String(30), unique=True)
    calories: Mapped[float | None] = mapped_column(Float)
    protein: Mapped[float | None] = mapped_column(Float)
    iron: Mapped[float | None] = mapped_column(Float)
    calcium: Mapped[float | None] = mapped_column(Float)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)


class FoodLog(Base):
    __tablename__ = "food_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    food_id: Mapped[int] = mapped_column(
        ForeignKey("foods.id"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    meal_type: Mapped[str] = mapped_column(String(30))
    grams: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class FavoriteFood(Base):
    __tablename__ = "favorite_foods"
    __table_args__ = (
        UniqueConstraint("user_id", "food_id", name="uq_favorite_food"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    food_id: Mapped[int] = mapped_column(
        ForeignKey("foods.id", ondelete="CASCADE")
    )


class MealPlan(Base):
    __tablename__ = "meal_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    start_date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class MealPlanItem(Base):
    __tablename__ = "meal_plan_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("meal_plans.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    meal_type: Mapped[str] = mapped_column(String(30))
    food_id: Mapped[int] = mapped_column(ForeignKey("foods.id"))
    grams: Mapped[float] = mapped_column(Float, default=150)
    eaten: Mapped[bool] = mapped_column(Boolean, default=False)
    food_log_id: Mapped[int | None] = mapped_column(
        ForeignKey("food_logs.id", ondelete="SET NULL")
    )


class HbRecord(Base):
    __tablename__ = "hb_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    value: Mapped[float] = mapped_column(Float)
    date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )