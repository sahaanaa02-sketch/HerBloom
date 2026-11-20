
from datetime import date, datetime

from sqlalchemy import (
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
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WeeklyReport(Base):
    __tablename__ = "weekly_reports"

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "week_start",
            name="uq_weekly_report_user_week",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    week_start: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )

    data_json: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )

    summary_text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    summary_language: Mapped[str | None] = mapped_column(
        String(5),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
