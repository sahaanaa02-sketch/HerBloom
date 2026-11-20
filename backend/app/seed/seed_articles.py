import json
from pathlib import Path
from datetime import date

from app.database import SessionLocal, Base, engine
from app.models.article import Article


DATA_FILE = Path(__file__).with_name("articles.json")


def seed_articles():
    Base.metadata.create_all(bind=engine)

    with DATA_FILE.open("r", encoding="utf-8") as file:
        articles = json.load(file)

    db = SessionLocal()

    try:
        for item in articles:
            existing = (
                db.query(Article)
                .filter(Article.slug == item["slug"])
                .first()
            )

            if existing:
                print(f"Skipped existing: {item['slug']}")
                continue

            db.add(Article(**item))
            print(f"Added: {item['slug']}")

        db.commit()
        print("Article seeding completed.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    seed_articles()