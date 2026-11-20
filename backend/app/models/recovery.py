
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean, Date, DateTime, Enum, Float, ForeignKey,
    Integer, JSON, String, Text, Time, false, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.admin import AdminUser
from app.models.media import MediaFile


class RecoveryContext(Base):
    __tablename__ = "recovery_contexts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, index=True
    )
    birth_date: Mapped[date] = mapped_column(Date)
    delivery_type: Mapped[str] = mapped_column(String(30))
    # This is not self-service clearance.
    exercise_cleared: Mapped[bool] = mapped_column(
        Boolean, default=False
    )


class SleepLog(Base):
    __tablename__ = "sleep_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    bed_time: Mapped[time] = mapped_column(Time)
    wake_time: Mapped[time] = mapped_column(Time)
    hours: Mapped[float] = mapped_column(Float)
    quality: Mapped[int] = mapped_column(Integer)
    wakings: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class WalkLog(Base):
    __tablename__ = "walk_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    minutes: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class BodyCheck(Base):
    __tablename__ = "body_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    wound: Mapped[bool] = mapped_column(Boolean, default=False)
    bleeding_level: Mapped[str] = mapped_column(
        String(20), default="none"
    )
    back_pain: Mapped[bool] = mapped_column(Boolean, default=False)
    pelvic_heaviness: Mapped[bool] = mapped_column(
        Boolean, default=False
    )
    urine_leakage: Mapped[bool] = mapped_column(
        Boolean, default=False
    )
    breast_pain: Mapped[bool] = mapped_column(
        Boolean, default=False
    )
    energy: Mapped[int] = mapped_column(Integer, default=3)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class RecoveryExercise(Base):
    __tablename__ = "recovery_exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)
    category: Mapped[str] = mapped_column(String(50))
    level: Mapped[str] = mapped_column(
        String(30), default="Gentle"
    )
    steps: Mapped[list] = mapped_column(JSON)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    equipment: Mapped[str] = mapped_column(
        String(200), default="None"
    )
    safety_notes: Mapped[str] = mapped_column(Text)
    contraindications: Mapped[str] = mapped_column(Text)
    min_week: Mapped[int] = mapped_column(Integer, default=0)
    allowed_delivery_types: Mapped[list] = mapped_column(JSON)
    needs_clearance: Mapped[bool] = mapped_column(
        Boolean, default=True
    )
    image_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    video_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    reviewed_by: Mapped[str | None] = mapped_column(
        String(150), nullable=True
    )
    review_date: Mapped[date | None] = mapped_column(
        Date, nullable=True
    )

    name_ta: Mapped[str | None] = mapped_column(String(150))
    steps_ta: Mapped[list | None] = mapped_column(JSON)
    safety_notes_ta: Mapped[str | None] = mapped_column(Text)
    contraindications_ta: Mapped[str | None] = mapped_column(Text)
    repetitions: Mapped[int | None] = mapped_column(Integer)
    is_premium: Mapped[bool] = mapped_column(Boolean, server_default=false())
    image_media_id: Mapped[int | None] = mapped_column(
        ForeignKey(MediaFile.__table__.c.id, name="fk_recovery_exercises_media", ondelete="SET NULL")
    )
    editorial_status: Mapped[str | None] = mapped_column(Enum("draft", "in_review", "archived", "published"))
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey(AdminUser.__table__.c.id, name="fk_recovery_exercises_created_by", ondelete="SET NULL")
    )
    updated_by: Mapped[int | None] = mapped_column(
        ForeignKey(AdminUser.__table__.c.id, name="fk_recovery_exercises_updated_by", ondelete="SET NULL")
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


class ExerciseSession(Base):
    __tablename__ = "exercise_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("recovery_exercises.id")
    )
    feeling: Mapped[str] = mapped_column(String(20))
    pain: Mapped[bool] = mapped_column(Boolean, default=False)
    bleeding: Mapped[bool] = mapped_column(Boolean, default=False)
    pelvic_heaviness: Mapped[bool] = mapped_column(
        Boolean, default=False
    )
    note: Mapped[str] = mapped_column(Text, default="")
    completed_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
