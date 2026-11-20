
from datetime import date, datetime
from sqlalchemy import (
    Boolean, Date, DateTime, Enum, ForeignKey, Integer,
    JSON, String, Text, UniqueConstraint, false, func, inspect
)
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.admin import AdminUser
from app.models.media import MediaFile


class WellbeingSchedule(Base):
    __tablename__ = "wellbeing_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, index=True
    )
    first_visit: Mapped[date] = mapped_column(Date, nullable=False)
    next_due: Mapped[date] = mapped_column(Date, nullable=False)


class WellbeingCheckin(Base):
    __tablename__ = "wellbeing_checkins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    submitted_on: Mapped[date] = mapped_column(Date, nullable=False)
    answers: Mapped[dict] = mapped_column(JSON, nullable=False)
    support_requested: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "due_date",
            name="uq_wellbeing_user_due"
        ),
    )


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    prompt: Mapped[str] = mapped_column(String(255), default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    gratitude: Mapped[str] = mapped_column(Text, default="")
    mood_tag: Mapped[str] = mapped_column(String(30), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )


class WellbeingActivity(Base):
    __tablename__ = "wellbeing_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    activity_type: Mapped[str] = mapped_column(String(30))
    duration_minutes: Mapped[int] = mapped_column(Integer)
    audio_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    steps: Mapped[list] = mapped_column(JSON, default=list)
    title_ta: Mapped[str | None] = mapped_column(String(120))
    steps_ta: Mapped[list | None] = mapped_column(JSON)
    audio_media_id: Mapped[int | None] = mapped_column(
        ForeignKey(MediaFile.__table__.c.id, name="fk_wellbeing_activities_audio", ondelete="SET NULL")
    )
    is_premium: Mapped[bool] = mapped_column(Boolean, server_default=false())
    editorial_status: Mapped[str | None] = mapped_column(Enum("draft", "in_review", "archived", "published"))
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey(AdminUser.__table__.c.id, name="fk_wellbeing_activities_created_by", ondelete="SET NULL")
    )
    updated_by: Mapped[int | None] = mapped_column(
        ForeignKey(AdminUser.__table__.c.id, name="fk_wellbeing_activities_updated_by", ondelete="SET NULL")
    )
    created_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)


EDITORIAL_COLUMNS = {
    "title_ta", "steps_ta", "audio_media_id", "is_premium", "editorial_status",
    "created_by", "updated_by", "created_at", "updated_at",
}


def wellbeing_activity_columns(db):
    return {column["name"] for column in inspect(db.connection()).get_columns("wellbeing_activities")}


class ActivitySession(Base):
    __tablename__ = "activity_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    activity_id: Mapped[int] = mapped_column(
        ForeignKey("wellbeing_activities.id")
    )
    completed_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
