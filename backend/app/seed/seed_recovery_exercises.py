
from sqlalchemy import select

from app.database import SessionLocal
from app.models.recovery import RecoveryExercise


EXERCISES = [
    {
        "name": "Gentle Breathing Awareness",
        "category": "Breathing and Relaxation",
        "level": "Gentle",
        "steps": [
            "Find a comfortable, supported resting position.",
            "Notice your natural breathing without forcing it.",
            "Allow your shoulders and jaw to relax.",
            "Continue breathing comfortably and rest whenever needed.",
        ],
        "duration_minutes": 3,
        "equipment": "Comfortable chair or pillow",
        "safety_notes": (
            "Breathe naturally. Do not hold your breath or force "
            "deep breathing. Stop if you feel dizzy or uncomfortable."
        ),
        "contraindications": (
            "Breathing difficulty, dizziness, chest discomfort, "
            "or instructions from your healthcare professional "
            "to avoid this activity."
        ),
        "min_week": 0,
        "allowed_delivery_types": ["vaginal", "csection"],
        "needs_clearance": False,
    },
    {
        "name": "Supported Posture Awareness",
        "category": "Posture and Comfort",
        "level": "Gentle",
        "steps": [
            "Sit in a comfortable position with your back supported.",
            "Keep your feet supported where possible.",
            "Notice whether your shoulders feel tense.",
            "Adjust your pillows or seating for comfort.",
        ],
        "duration_minutes": 3,
        "equipment": "Chair and pillow",
        "safety_notes": (
            "Choose a comfortable position and avoid pressure "
            "on painful or healing areas."
        ),
        "contraindications": (
            "Pain with sitting, wound discomfort, or specific "
            "movement restrictions."
        ),
        "min_week": 0,
        "allowed_delivery_types": ["vaginal", "csection"],
        "needs_clearance": False,
    },
    {
        "name": "Relaxation and Rest Check-In",
        "category": "Breathing and Relaxation",
        "level": "Gentle",
        "steps": [
            "Find a quiet and comfortable place to rest.",
            "Notice any areas where your body feels tense.",
            "Allow yourself a short period of comfortable rest.",
            "Reflect on whether you need more rest or support.",
        ],
        "duration_minutes": 5,
        "equipment": "None",
        "safety_notes": (
            "This is a relaxation activity, not a physical "
            "recovery assessment."
        ),
        "contraindications": (
            "Any position that causes pain or discomfort."
        ),
        "min_week": 0,
        "allowed_delivery_types": ["vaginal", "csection"],
        "needs_clearance": False,
    },
    {
        "name": "Pelvic Floor Education",
        "category": "Pelvic Floor Awareness",
        "level": "Educational",
        "steps": [
            "Learn that the pelvic floor supports pelvic organs.",
            "Understand that childbirth can affect pelvic floor function.",
            "Notice symptoms such as heaviness, discomfort, or leakage.",
            "Discuss suitable pelvic floor exercises with a "
            "qualified healthcare professional.",
        ],
        "duration_minutes": 4,
        "equipment": "None",
        "safety_notes": (
            "Educational information only. This activity does "
            "not prescribe pelvic floor contractions."
        ),
        "contraindications": (
            "Persistent pelvic pain, heaviness, or other symptoms "
            "that require professional assessment."
        ),
        "min_week": 0,
        "allowed_delivery_types": ["vaginal", "csection"],
        "needs_clearance": False,
    },
    {
        "name": "Comfortable Walking Awareness",
        "category": "Walking Guidance",
        "level": "Gentle",
        "steps": [
            "Consider how comfortable you feel with everyday walking.",
            "Follow any walking restrictions given after delivery.",
            "If walking is already permitted, choose a comfortable pace.",
            "Rest when needed and notice any new discomfort.",
        ],
        "duration_minutes": 5,
        "equipment": "Supportive footwear",
        "safety_notes": (
            "Do not treat the listed duration as a target. "
            "Avoid walking when symptoms or medical restrictions "
            "make it unsuitable."
        ),
        "contraindications": (
            "Dizziness, increased bleeding, significant pain, "
            "mobility restrictions, or concerning symptoms."
        ),
        "min_week": 0,
        "allowed_delivery_types": ["vaginal", "csection"],
        "needs_clearance": True,
    },
    {
        "name": "C-section Movement Precautions",
        "category": "C-section Recovery",
        "level": "Educational",
        "steps": [
            "Review the movement precautions provided at discharge.",
            "Learn why protecting the healing incision matters.",
            "Avoid activities that increase wound discomfort.",
            "Ask your healthcare professional about suitable "
            "activity progression.",
        ],
        "duration_minutes": 4,
        "equipment": "None",
        "safety_notes": (
            "Educational guidance only. Follow your own "
            "surgical discharge instructions."
        ),
        "contraindications": (
            "New wound symptoms, fever, worsening pain, or "
            "other concerning postoperative symptoms."
        ),
        "min_week": 0,
        "allowed_delivery_types": ["csection"],
        "needs_clearance": False,
    },
    {
        "name": "Vaginal Birth Comfort Education",
        "category": "Vaginal Birth Recovery",
        "level": "Educational",
        "steps": [
            "Review your discharge instructions for birth recovery.",
            "Learn about the importance of rest and comfort.",
            "Notice any ongoing perineal discomfort.",
            "Discuss persistent pain or pelvic symptoms "
            "with a healthcare professional.",
        ],
        "duration_minutes": 4,
        "equipment": "None",
        "safety_notes": (
            "Educational guidance only. Avoid positions "
            "or movements that increase discomfort."
        ),
        "contraindications": (
            "Worsening pain, concerning bleeding, or "
            "other symptoms requiring assessment."
        ),
        "min_week": 0,
        "allowed_delivery_types": ["vaginal"],
        "needs_clearance": False,
    },
]


def seed_exercises():
    db = SessionLocal()

    created = 0
    updated = 0

    try:
        for data in EXERCISES:
            existing = db.scalar(
                select(RecoveryExercise).where(
                    RecoveryExercise.name == data["name"]
                )
            )

            if existing:
                for key, value in data.items():
                    setattr(existing, key, value)

                updated += 1
            else:
                exercise = RecoveryExercise(
                    **data,
                    image_url=None,
                    video_url=None,
                    reviewed_by=None,
                    review_date=None,
                )

                db.add(exercise)
                created += 1

        db.commit()

        print("Exercise Library seeded successfully.")
        print(f"Created: {created}")
        print(f"Updated: {updated}")
        print(f"Total seed definitions: {len(EXERCISES)}")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    seed_exercises()
