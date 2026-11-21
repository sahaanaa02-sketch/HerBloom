
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.mother_profile import MotherProfile
from app.models.nutrition import Food, MealPlan, MealPlanItem
from app.services.nutrition_service import today


MEAL_TYPES = [
    "breakfast",
    "morning_snack",
    "lunch",
    "evening_snack",
    "dinner",
]

SLOTS = {
    "breakfast": ["breakfast"],
    "morning_snack": ["fruit", "snack"],
    "lunch": ["lunch"],
    "evening_snack": ["fruit", "snack"],
    "dinner": ["dinner", "lunch"],
}


def requires_dietary_review(profile):
    if profile.allergies or profile.avoid_foods:
        return True

    if str(profile.gdm_history).lower() in {
        "yes", "true", "1"
    }:
        return True

    return False


def safe_foods(db, profile):
    if requires_dietary_review(profile):
        raise HTTPException(
            422,
            "Automatic meal planning requires individual "
            "dietary review because allergies, avoided foods "
            "or GDM history are recorded.",
        )

    foods = db.scalars(
        select(Food).where(
            Food.verified.is_(True)
        ).order_by(Food.name_en)
    ).all()

    if not foods:
        raise HTTPException(
            422,
            "No verified foods available. "
            "Import reviewed food data first.",
        )

    return foods


def generate_plan(db: Session, user_id: int):
    profile = db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == user_id
        )
    )

    if not profile:
        raise HTTPException(
            404, "Mother profile not found."
        )

    foods = safe_foods(db, profile)

    pools = {}

    for slot, categories in SLOTS.items():
        pools[slot] = [
            food for food in foods
            if food.category in categories
        ]

        if not pools[slot]:
            raise HTTPException(
                422,
                f"No verified foods available for {slot}.",
            )

    start = today()
    start -= timedelta(days=start.weekday())

    existing = db.scalar(
        select(MealPlan).where(
            MealPlan.user_id == user_id,
            MealPlan.start_date == start,
        ).order_by(MealPlan.id.desc())
    )

    if existing:
        items = db.scalars(
            select(MealPlanItem)
            .where(MealPlanItem.plan_id == existing.id)
            .order_by(MealPlanItem.date, MealPlanItem.id)
            .with_for_update()
        ).all()
        used_by_day = {}
        for item in items:
            used_by_day.setdefault(item.date, set()).add(item.food_id)
        for item in items:
            if item.eaten or item.food_log_id is not None:
                continue
            used = used_by_day[item.date]
            replacement = next(
                (food for food in pools[item.meal_type] if food.id not in used),
                None,
            )
            if replacement is not None:
                previous_id = item.food_id
                item.food_id = replacement.id
                if not any(peer.date == item.date and peer.food_id == previous_id for peer in items):
                    used.discard(previous_id)
                used.add(replacement.id)
        db.commit()
        return existing

    plan = MealPlan(
        user_id=user_id,
        start_date=start,
    )

    db.add(plan)
    db.flush()

    for day_index in range(7):
        current = start + timedelta(days=day_index)
        used_food_ids = set()

        for slot_index, slot in enumerate(MEAL_TYPES):
            options = pools[slot]

            available = [
                food for food in options
                if food.id not in used_food_ids
            ]

            if not available:
                available = options

            food = available[
                (day_index + slot_index) % len(available)
            ]

            used_food_ids.add(food.id)

            db.add(
                MealPlanItem(
                    plan_id=plan.id,
                    date=current,
                    meal_type=slot,
                    food_id=food.id,
                    grams=150,
                    eaten=False,
                )
            )

    db.commit()
    db.refresh(plan)

    return plan


def plan_response(db, plan):
    if not plan:
        return None

    items = db.scalars(
        select(MealPlanItem).where(
            MealPlanItem.plan_id == plan.id
        ).order_by(
            MealPlanItem.date,
            MealPlanItem.id,
        )
    ).all()

    results = []

    for item in items:
        food = db.get(Food, item.food_id)

        if not food:
            continue

        results.append({
            "id": item.id,
            "date": item.date.isoformat(),
            "meal_type": item.meal_type,
            "food_id": item.food_id,
            "food_name": food.name_en,
            "grams": item.grams,
            "eaten": item.eaten,
        })

    return {
        "id": plan.id,
        "start_date": plan.start_date.isoformat(),
        "items": results,
        "disclaimer": (
            "This is an educational prototype, not a "
            "clinically validated or allergy-safe meal plan."
        ),
    }
