
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MotherProfile(Base):
    __tablename__ = "mother_profiles"

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_mother_profiles_user_id"),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # STEP 1 — About you and your baby
    display_name: Mapped[str | None] = mapped_column(
        String(150), nullable=True
    )
    baby_birth_date: Mapped[date | None] = mapped_column(
        Date, nullable=True
    )
    babies_count: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )
    first_baby: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )

    # STEP 2 — Your birth
    delivery_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )

    # Vaginal birth
    perineal_tear: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    assisted_birth: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )

    # C-section
    csection_type: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )

    # Exercise and activity
    exercise_cleared: Mapped[str] = mapped_column(
        String(20), default="not_yet", nullable=False
    )
    exercise_cleared_month: Mapped[str | None] = mapped_column(
        String(7), nullable=True
    )
    activity_limits: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    activity_limits_note: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    # STEP 3 — Feeding and food
    feeding_method: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    diet_type: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    allergies: Mapped[list | None] = mapped_column(
        JSON, nullable=True
    )
    avoid_foods: Mapped[list | None] = mapped_column(
        JSON, nullable=True
    )

    # STEP 4 — Your health
    anaemia: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    gdm_history: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    high_bp: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    thyroid: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )

    # Anaemia follow-ups
    hb_value: Mapped[float | None] = mapped_column(
        nullable=True
    )
    hb_month: Mapped[str | None] = mapped_column(
        String(7), nullable=True
    )
    iron_prescribed: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )

    # GDM follow-ups
    gdm_test_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    gdm_result: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    gdm_test_month: Mapped[str | None] = mapped_column(
        String(7), nullable=True
    )

    # Blood pressure follow-up
    bp_medicine: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )

    # Emotional wellbeing and other concerns
    mental_health_history: Mapped[str] = mapped_column(
        String(20), default="undisclosed", nullable=False
    )
    other_health_note: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    # STEP 5 — Preferences and privacy
    language: Mapped[str] = mapped_column(
        String(5), default="en", nullable=False
    )
    reminders: Mapped[list | None] = mapped_column(
        JSON, nullable=True
    )
    quiet_from: Mapped[str] = mapped_column(
        String(5), default="22:00", nullable=False
    )
    quiet_to: Mapped[str] = mapped_column(
        String(5), default="06:00", nullable=False
    )

    care_contact_name: Mapped[str | None] = mapped_column(
        String(150), nullable=True
    )
    care_contact_phone: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )

    consent_ai_profile: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # Onboarding progress
    onboarding_step: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )
    onboarding_done: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationship to existing User model
    user = relationship("User")
