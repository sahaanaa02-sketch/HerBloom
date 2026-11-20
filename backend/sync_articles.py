import json
from pathlib import Path

from sqlalchemy import select

from app.database import (
    SessionLocal,
    engine,
    Base,
)

from app.models.article import Article


DATA_FILE = (
    Path(__file__).resolve().parent
    / "app"
    / "seed"
    / "articles.json"
)


CONTENT_FIELDS = (
    "category",
    "title_en",
    "title_ta",
    "body_en",
    "body_ta",
    "image_url",
    "read_time",
    "key_points_en",
    "key_points_ta",
    "doctor_note_en",
    "doctor_note_ta",
    "min_week",
    "max_week",
    "delivery_type",
    "safety_label",
    "published",
)


def main():
    with open(
        DATA_FILE,
        "r",
        encoding="utf-8"
    ) as file:
        articles = json.load(file)

    if not isinstance(articles, list):
        raise ValueError(
            "articles.json must contain a JSON list."
        )

    slugs = [
        item["slug"]
        for item in articles
    ]

    if len(slugs) != len(set(slugs)):
        raise ValueError(
            "Duplicate article slugs found."
        )

    Base.metadata.create_all(
        bind=engine,
        tables=[Article.__table__],
    )

    inserted = 0
    updated = 0

    with SessionLocal() as db:
        try:
            for data in articles:
                article = db.scalar(
                    select(Article).where(
                        Article.slug == data["slug"]
                    )
                )

                if article is None:
                    article = Article(
                        slug=data["slug"],
                        published=False,
                    )

                    db.add(article)
                    inserted += 1

                else:
                    updated += 1

                for field in CONTENT_FIELDS:
                    if field in data:
                        setattr(
                            article,
                            field,
                            data[field]
                        )

            db.commit()

        except Exception:
            db.rollback()
            raise

    print("Article synchronization completed.")
    print(f"Inserted: {inserted}")
    print(f"Updated: {updated}")
    print(f"Total in JSON: {len(articles)}")
    print(
        "Published status synchronized from JSON."
    )
    print(
        "Medical reviewer details were not changed."
    )


if __name__ == "__main__":
    main()