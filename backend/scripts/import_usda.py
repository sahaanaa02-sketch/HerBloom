import csv
import os
import sys

from sqlalchemy import select

from app.database import SessionLocal
from app.models.nutrition import Food


def run(csv_path):
    if not os.path.exists(csv_path):
        raise FileNotFoundError(csv_path)

    with SessionLocal() as db:
        count = 0

        with open(csv_path, encoding="utf-8-sig") as file:
            reader = csv.DictReader(file)

            required = {
                "name_en", "category",
                "calories", "protein", "iron", "calcium"
            }

            if not required.issubset(reader.fieldnames or []):
                raise ValueError(
                    "CSV must contain: " + ", ".join(sorted(required))
                )

            for item in reader:
                name = item["name_en"].strip()

                if not name:
                    continue

                existing = db.scalar(
                    select(Food).where(Food.name_en == name)
                )

                if existing:
                    continue

                db.add(Food(
                    name_en=name,
                    name_ta=item.get("name_ta") or None,
                    category=item["category"],
                    calories=float(item["calories"]),
                    protein=float(item["protein"]),
                    iron=float(item["iron"]),
                    calcium=float(item["calcium"]),
                    source=item.get("source") or "USDA review pending",
                    verified=False,
                ))
                count += 1

        db.commit()
        print(f"Imported {count} foods for review.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m scripts.import_usda path/to/foods.csv")
        sys.exit(1)

    run(sys.argv[1])