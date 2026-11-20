
from app.database import Base, engine, SessionLocal
from app.models.recovery import (
    RecoveryContext, SleepLog, WalkLog, BodyCheck,
    RecoveryExercise, ExerciseSession,
)

TABLES = [
    RecoveryContext.__table__,
    SleepLog.__table__,
    WalkLog.__table__,
    BodyCheck.__table__,
    RecoveryExercise.__table__,
    ExerciseSession.__table__,
]

Base.metadata.create_all(bind=engine, tables=TABLES)

# These are draft catalogue entries, not reviewed instructions.
# All remain locked until clinically reviewed.
CATALOGUE = [
    ("Quiet Rest", "breathing", 2, 0),
    ("Comfortable Breathing Awareness", "breathing", 2, 0),
    ("Relaxed Sitting", "posture and back", 3, 0),
    ("Supported Rest", "stretching", 3, 0),
    ("Gentle Walking Guidance", "walking", 5, 0),
    ("Pelvic Floor Awareness", "pelvic floor", 3, 1),
    ("Posture Awareness", "posture and back", 3, 1),
    ("Gentle Core Awareness", "gentle core", 3, 6),
    ("Supported Mobility Guidance", "walking", 5, 2),
    ("Gentle Stretching Guidance", "stretching", 5, 6),
]

with SessionLocal() as db:
    for name, category, duration, week in CATALOGUE:
        exists = db.query(RecoveryExercise).filter_by(
            name=name
        ).first()

        if exists:
            continue

        db.add(
            RecoveryExercise(
                name=name,
                category=category,
                level="Gentle",
                steps=[
                    "Read the safety guidance before starting.",
                    "Follow the reviewed instructions when available.",
                    "Stop if you feel uncomfortable.",
                ],
                duration_minutes=duration,
                equipment="None",
                safety_notes=(
                    "Draft content awaiting qualified clinical review."
                ),
                contraindications=(
                    "Do not use this draft as an exercise prescription."
                ),
                min_week=week,
                allowed_delivery_types=[
                    "vaginal", "c_section"
                ],
                needs_clearance=True,
                reviewed_by=None,
                review_date=None,
            )
        )

    db.commit()

print("Recovery tables created and draft catalogue seeded.")
