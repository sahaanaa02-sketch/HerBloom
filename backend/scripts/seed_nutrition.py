import csv
import json
from pathlib import Path

from sqlalchemy import select

from app.database import SessionLocal
from app.models.user import User
from app.models.nutrition import Food, MealIdea


DATA = Path(__file__).resolve().parents[1] / "app" / "data"


def run():
    with SessionLocal() as db:
        with open(DATA / "foods.csv", encoding="utf-8-sig") as file:
            for item in csv.DictReader(file):
                existing = db.scalar(
                    select(Food).where(
                        Food.name_en == item["name_en"]
                    )
                )

                if existing:
                    continue

                db.add(
                    Food(
                        name_en=item["name_en"],
                        name_ta=item["name_ta"],
                        category=item["category"],
                        calories=float(item["calories"]),
                        protein=float(item["protein"]),
                        iron=float(item["iron"]),
                        calcium=float(item["calcium"]),
                        source=item["source"],
                        verified=item["verified"].lower() == "true",
                    )
                )

        with open(DATA / "meal_ideas.json", encoding="utf-8") as file:
            ideas = json.load(file)

        for item in ideas:
            existing = db.scalar(
                select(MealIdea).where(
                    MealIdea.title == item["title"]
                )
            )

            if existing:
                continue

            db.add(MealIdea(**item))

        db.commit()

    print("Nutrition starter data imported successfully.")


if __name__ == "__main__":
    run()