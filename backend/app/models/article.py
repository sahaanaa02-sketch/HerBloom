from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, Enum, ForeignKey, Integer,
    JSON, String, Text, false, func,
)
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.admin import AdminUser
from app.models.media import MediaFile


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(50), index=True)

    title_en: Mapped[str] = mapped_column(String(250))
    title_ta: Mapped[str] = mapped_column(String(250))
    body_en: Mapped[str] = mapped_column(Text)
    body_ta: Mapped[str] = mapped_column(Text)

    image_url: Mapped[str | None] = mapped_column(String(1000))
    read_time: Mapped[int] = mapped_column(Integer, default=4)

    key_points_en: Mapped[list] = mapped_column(JSON, default=list)
    key_points_ta: Mapped[list] = mapped_column(JSON, default=list)

    doctor_note_en: Mapped[str | None] = mapped_column(Text)
    doctor_note_ta: Mapped[str | None] = mapped_column(Text)

    reviewed_by: Mapped[str | None] = mapped_column(String(150))
    review_date: Mapped[date | None] = mapped_column(Date)

    min_week: Mapped[int | None] = mapped_column(Integer)
    max_week: Mapped[int | None] = mapped_column(Integer)
    delivery_type: Mapped[str] = mapped_column(String(20), default="any")

    safety_label: Mapped[str | None] = mapped_column(String(30))
    published: Mapped[bool] = mapped_column(Boolean, default=False)

    editorial_status: Mapped[str | None] = mapped_column(
        Enum("draft", "in_review", "archived", "published")
    )
    first_baby_only: Mapped[bool] = mapped_column(Boolean, server_default=false())
    is_premium: Mapped[bool] = mapped_column(Boolean, server_default=false())
    image_media_id: Mapped[int | None] = mapped_column(
        ForeignKey(MediaFile.__table__.c.id, name="fk_articles_media", ondelete="SET NULL")
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey(AdminUser.__table__.c.id, name="fk_articles_created_by", ondelete="SET NULL")
    )
    updated_by: Mapped[int | None] = mapped_column(
        ForeignKey(AdminUser.__table__.c.id, name="fk_articles_updated_by", ondelete="SET NULL")
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    @hybrid_property
    def publicly_visible(self) -> bool:
        return self.published and self.editorial_status in (None, "published")

    @publicly_visible.inplace.expression
    @classmethod
    def _publicly_visible(cls):
        return cls.published.is_(True) & (cls.editorial_status.is_(None) | (cls.editorial_status == "published"))
