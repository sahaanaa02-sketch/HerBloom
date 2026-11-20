from typing import Literal, Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, ValidationError, field_validator
from sqlalchemy import MetaData, Table, inspect, select
from fastapi import HTTPException

from app.config import settings


class SiteSettings(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    supported_languages: list[Literal["en", "ta"]] = Field(default_factory=lambda: ["en", "ta"], min_length=1, max_length=2)
    maintenance_banner_en: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    maintenance_banner_ta: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    support_email: EmailStr | None = None
    stage2_enabled: bool = False

    @field_validator("supported_languages")
    @classmethod
    def language_order(cls, values):
        if len(set(values)) != len(values) or "en" not in values:
            raise ValueError("English is required and each language may appear once.")
        return values


def ready(db):
    # Created last so account/session integration stays dormant during partial DDL.
    return inspect(db.connection()).has_table("app_settings")


def require_ready(db):
    if not ready(db):
        raise HTTPException(503, "Settings management is awaiting its database migration.")


def table(db, name):
    return Table(name, MetaData(), autoload_with=db.connection(), resolve_fks=False)


def read_settings(db, lock=False):
    defaults = SiteSettings(stage2_enabled=settings.STAGE2_ENABLED)
    if not ready(db):
        return defaults
    storage = table(db, "app_settings")
    allowed = set(SiteSettings.model_fields)
    stmt = select(storage.c.key, storage.c.value_json).where(storage.c.key.in_(allowed))
    if lock:
        stmt = stmt.with_for_update()
    values = dict(db.execute(stmt).all())
    data = defaults.model_dump()
    for key, value in values.items():
        # Malformed persisted values never leak or enable a feature.
        try:
            validated = SiteSettings.model_validate({**defaults.model_dump(), key: value})
            data[key] = getattr(validated, key)
        except ValidationError:
            if key == "stage2_enabled":
                data[key] = False
    return SiteSettings.model_validate(data)
