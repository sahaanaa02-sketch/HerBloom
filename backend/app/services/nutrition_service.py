
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.nutrition import Food, FoodLog, NutritionTarget
from app.models.hydration import HydrationLog
from app.models.mother_profile import MotherProfile


def today():
    return datetime.now(ZoneInfo("Asia/Colombo")).date()


def nutrients(food, grams):
    if not food.verified:
        return None

    factor = grams / 100

    return {
        "calories": round(food.calories * factor, 1),
        "protein": round(food.protein * factor, 1),
        "iron": round(food.iron * factor, 2),
        "calcium": round(food.calcium * factor, 1),
    }


def daily_summary(db: Session, user_id: int, day=None):
    day = day or today()

    logs = db.scalars(
        select(FoodLog).where(
            FoodLog.user_id == user_id,
            FoodLog.date == day,
        ).order_by(FoodLog.id.desc())
    ).all()

    totals = {
        "calories": 0.0,
        "protein": 0.0,
        "iron": 0.0,
        "calcium": 0.0,
    }

    meals = []
    unverified_count = 0

    for log in logs:
        food = db.get(Food, log.food_id)

        if not food:
            continue

        values = nutrients(food, log.grams)

        if values is None:
            unverified_count += 1
        else:
            for key in totals:
                totals[key] += values[key]

        meals.append({
            "id": log.id,
            "food_id": food.id,
            "food_name": food.name_en,
            "food_name_ta": food.name_ta,
            "meal_type": log.meal_type,
            "grams": log.grams,
            "date": log.date.isoformat(),
            "nutrients": values,
            "verified": food.verified,
        })

    profile = db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == user_id
        )
    )

    target = None

    if profile:
        target = db.scalar(
            select(NutritionTarget).where(
                NutritionTarget.feeding_method == profile.feeding_method,
                NutritionTarget.reviewed.is_(True),
            )
        )

    water = db.scalar(
        select(HydrationLog).where(
            HydrationLog.user_id == user_id,
            HydrationLog.date == day,
        )
    )

    return {
        "date": day.isoformat(),
        "totals": {
            k: round(v, 2)
            for k, v in totals.items()
        },
        "targets": {
            "calories": target.calories if target else None,
            "protein": target.protein if target else None,
            "iron": target.iron if target else None,
            "calcium": target.calcium if target else None,
        },
        "water_glasses": water.glasses if water else 0,
        "meals_logged": len(meals),
        "unverified_meals": unverified_count,
        "nutrient_data_complete": unverified_count == 0,
        "meals": meals,
        "note": (
            "Totals include only foods with verified nutrient data. "
            "Missing values do not mean zero intake. "
            "Targets require professional review."
        ),
    }
