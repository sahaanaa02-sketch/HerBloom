
from sqlalchemy import select

from app.database import Base, engine, SessionLocal
from app.models.user import User
from app.models.wellbeing import (
    WellbeingSchedule,
    WellbeingCheckin,
    JournalEntry,
    WellbeingActivity,
    ActivitySession,
)

Base.metadata.create_all(
    bind=engine,
    tables=[
        WellbeingSchedule.__table__,
        WellbeingCheckin.__table__,
        JournalEntry.__table__,
        WellbeingActivity.__table__,
        ActivitySession.__table__,
    ],
)

seed = [
    ("Gentle Breathing", "breathing", 1),
    ("Gentle Breathing", "breathing", 2),
    ("Gentle Breathing", "breathing", 5),
    ("Guided Rest", "meditation", 2),
    ("Guided Rest", "meditation", 5),
    ("Guided Rest", "meditation", 10),
]

db = SessionLocal()

try:
    for title, kind, duration in seed:
        existing = db.scalar(
            select(WellbeingActivity).where(
                WellbeingActivity.title == title,
                WellbeingActivity.activity_type == kind,
                WellbeingActivity.duration_minutes == duration,
            )
        )

        if existing is None:
            db.add(
                WellbeingActivity(
                    title=title,
                    activity_type=kind,
                    duration_minutes=duration,
                    audio_url=None,
                    steps=[
                        "Find a comfortable position",
                        "Follow the gentle instructions",
                        "Stop if you feel uncomfortable",
                    ],
                )
            )

    db.commit()
    print("Wellbeing tables and activities ready.")

finally:
    db.close()
