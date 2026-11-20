from app.database import Base, engine

from app.models.user import User
from app.models.mother_profile import MotherProfile
from app.models.hydration import HydrationLog

from app.models.nutrition import (
    Food,
    FoodAlias,
    MealIdea,
    NutritionTarget,
    FoodLog,
    FavoriteFood,
    MealPlan,
    MealPlanItem,
    HbRecord,
)


def run():
    names = [
        "foods",
        "food_aliases",
        "meal_ideas",
        "nutrition_targets",
        "food_logs",
        "favorite_foods",
        "meal_plans",
        "meal_plan_items",
        "hb_records",
    ]

    for name in names:
        Base.metadata.tables[name].create(
            bind=engine,
            checkfirst=True,
        )
        print(f"Ready: {name}")

    print("Nutrition tables are ready.")


if __name__ == "__main__":
    run()