from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.mysql import VARCHAR
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GoogleIdentity(Base):
    __tablename__ = "google_identities"
    __table_args__ = (
        CheckConstraint(
            "(mother_id IS NULL) <> (admin_id IS NULL)", name="ck_google_identity_one_owner"
        ),
        UniqueConstraint("mother_id", name="uq_google_identity_mother"),
        UniqueConstraint("admin_id", name="uq_google_identity_admin"),
    )

    subject: Mapped[str] = mapped_column(
        String(255).with_variant(VARCHAR(255, charset="ascii", collation="ascii_bin"), "mysql"),
        primary_key=True,
    )
    mother_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", name="fk_google_identity_mother", ondelete="CASCADE")
    )
    admin_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("admin_users.id", name="fk_google_identity_admin", ondelete="CASCADE")
    )
