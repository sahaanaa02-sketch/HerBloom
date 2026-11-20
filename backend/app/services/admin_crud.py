
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.inspection import inspect
from sqlalchemy.orm import Session

from app.services.admin_audit import record_admin_audit


class AdminCRUD:
    """
    Reusable CRUD service for Admin Portal resources.

    Features:
    - Paginated lists
    - Search using explicitly allowed fields
    - Filtering using explicitly allowed fields
    - Get single record
    - Create
    - Update
    - Soft archive
    - Audit logging

    Authentication and permission dependencies must be
    enforced by the API router.
    """

    def __init__(
        self,
        model: type,
        resource: str,
        *,
        create_fields: set[str],
        update_fields: set[str],
        search_fields: set[str] | None = None,
        filter_fields: set[str] | None = None,
        archive_field: str = "status",
        archive_value: Any = "archived",
        protect_published_updates: bool = False,
        status_field: str = "status",
        draft_only_updates: bool = False,
        allow_legacy_draft_updates: bool = True,
        track_write_timestamps: bool = False,
    ):
        self.model = model
        self.resource = resource
        self.create_fields = set(create_fields)
        self.update_fields = set(update_fields)
        self.search_fields = set(search_fields or [])
        self.filter_fields = set(filter_fields or [])
        self.archive_field = archive_field
        self.archive_value = archive_value
        self.protect_published_updates = protect_published_updates
        self.status_field = status_field
        self.draft_only_updates = draft_only_updates
        self.editable_draft_statuses = (None, "draft") if allow_legacy_draft_updates else ("draft",)
        self.track_write_timestamps = track_write_timestamps

        mapper = inspect(model)

        self.columns = {
            column.key: column
            for column in mapper.columns
        }

        self.primary_keys = [
            column.key
            for column in mapper.primary_key
        ]

        if len(self.primary_keys) != 1:
            raise ValueError(
                "AdminCRUD requires a single-column primary key."
            )

        self.pk_name = self.primary_keys[0]

        allowed = (
            self.create_fields
            | self.update_fields
            | self.search_fields
            | self.filter_fields
        )

        unknown = allowed - set(self.columns)

        if unknown:
            raise ValueError(
                f"Unknown fields for {resource}: {sorted(unknown)}"
            )

        if archive_field not in self.columns:
            raise ValueError(
                f"Archive field '{archive_field}' "
                f"does not exist on {resource}."
            )

        protected = {
            self.pk_name,
            "created_by",
            "updated_by",
            "reviewed_by",
            "reviewed_at",
            "review_date",
            "next_review_due",
            "created_at",
            "updated_at",
            "published",
            "status",
            self.status_field,
        }

        forbidden = (
            self.create_fields | self.update_fields
        ) & protected

        if forbidden:
            raise ValueError(
                "System-managed fields cannot be directly edited: "
                f"{sorted(forbidden)}"
            )

    def _snapshot(self, obj: Any) -> dict[str, Any]:
        """
        Convert model columns to JSON-compatible values.
        """

        result = {}

        for name in self.columns:
            value = getattr(obj, name)

            if isinstance(value, (datetime, date)):
                value = value.isoformat()

            elif isinstance(value, bytes):
                value = None

            result[name] = value

        return result

    def _get_or_404(
        self,
        db: Session,
        record_id: int,
    ):
        obj = db.get(self.model, record_id)

        if obj is None:
            raise HTTPException(
                status_code=404,
                detail=f"{self.resource} record not found.",
            )

        return obj

    def _validate_payload(
        self,
        payload: dict[str, Any],
        allowed_fields: set[str],
    ) -> dict[str, Any]:

        unknown = set(payload) - allowed_fields

        if unknown:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Fields are not editable.",
                    "fields": sorted(unknown),
                },
            )

        return payload

    def list_records(
        self,
        db: Session,
        *,
        page: int = 1,
        page_size: int = 20,
        search: str | None = None,
        filters: dict[str, Any] | None = None,
        extra_conditions: tuple = (),
    ) -> dict[str, Any]:

        if page < 1 or not 1 <= page_size <= 100:
            raise HTTPException(
                status_code=422,
                detail="Invalid pagination values.",
            )

        query = select(self.model).where(*extra_conditions)

        if search and search.strip() and self.search_fields:
            term = f"%{search.strip()}%"

            conditions = [
                cast(
                    getattr(self.model, field),
                    String,
                ).ilike(term)
                for field in self.search_fields
            ]

            query = query.where(or_(*conditions))

        for field, value in (filters or {}).items():

            if field not in self.filter_fields:
                raise HTTPException(
                    status_code=422,
                    detail=f"Unsupported filter: {field}",
                )

            if value is None or value == "":
                continue

            query = query.where(
                getattr(self.model, field) == value
            )

        total = db.scalar(
            select(func.count()).select_from(
                query.order_by(None).subquery()
            )
        ) or 0

        pk = getattr(self.model, self.pk_name)

        items = db.scalars(
            query
            .order_by(pk.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()

        return {
            "items": [
                self._snapshot(item)
                for item in items
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def get_record(
        self,
        db: Session,
        record_id: int,
    ) -> dict[str, Any]:

        obj = self._get_or_404(db, record_id)

        return self._snapshot(obj)

    def create_record(
        self,
        db: Session,
        *,
        admin_id: int,
        payload: dict[str, Any],
        request=None,
    ) -> dict[str, Any]:

        data = self._validate_payload(
            payload,
            self.create_fields,
        )

        obj = self.model(**data)
        if self.track_write_timestamps:
            obj.created_at = obj.updated_at = func.now()

        if "created_by" in self.columns:
            obj.created_by = admin_id

        if "updated_by" in self.columns:
            obj.updated_by = admin_id

        if self.status_field in self.columns:
            setattr(obj, self.status_field, "draft")

        if "published" in self.columns:
            obj.published = False

        try:
            db.add(obj)
            db.flush()

            after = self._snapshot(obj)

            record_admin_audit(
                db,
                admin_id=admin_id,
                action=f"{self.resource}.created",
                entity=self.resource,
                entity_id=getattr(obj, self.pk_name),
                before=None,
                after=after,
                request=request,
            )

            db.commit()
            db.refresh(obj)

            return self._snapshot(obj)

        except Exception:
            db.rollback()
            raise

    def update_record(
        self,
        db: Session,
        record_id: int,
        *,
        admin_id: int,
        payload: dict[str, Any],
        request=None,
    ) -> dict[str, Any]:

        data = self._validate_payload(
            payload,
            self.update_fields,
        )

        try:
            pk = getattr(self.model, self.pk_name)

            obj = db.scalar(
                select(self.model)
                .where(pk == record_id)
                .with_for_update()
            )

            if obj is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"{self.resource} record not found.",
                )

            status = getattr(obj, self.status_field, None)
            if status == "archived" or (self.draft_only_updates and status not in self.editable_draft_statuses):
                raise HTTPException(
                    status_code=409,
                    detail="Only drafts can be edited." if self.draft_only_updates
                    else "Archived records cannot be edited.",
                )

            if self.protect_published_updates and obj.published:
                raise HTTPException(
                    status_code=409,
                    detail="Published articles are read-only.",
                )

            before = self._snapshot(obj)

            for field, value in data.items():
                setattr(obj, field, value)

            if "updated_by" in self.columns:
                obj.updated_by = admin_id

            if self.track_write_timestamps:
                obj.updated_at = func.now()

            # Draft-only resources leave approval and publication to their workflow.
            if data and not self.draft_only_updates:
                for field in ("reviewed_at", "reviewed_by", "next_review_due"):
                    if field in self.columns:
                        setattr(obj, field, None)
                if "published" in self.columns:
                    obj.published = False

            if data and self.status_field in self.columns:
                setattr(obj, self.status_field, "draft")

            db.flush()

            after = self._snapshot(obj)

            record_admin_audit(
                db,
                admin_id=admin_id,
                action=f"{self.resource}.updated",
                entity=self.resource,
                entity_id=record_id,
                before=before,
                after=after,
                request=request,
            )

            db.commit()
            db.refresh(obj)

            return self._snapshot(obj)

        except Exception:
            db.rollback()
            raise

    def archive_record(
        self,
        db: Session,
        record_id: int,
        *,
        admin_id: int,
        request=None,
    ) -> dict[str, Any]:

        try:
            pk = getattr(self.model, self.pk_name)

            obj = db.scalar(
                select(self.model)
                .where(pk == record_id)
                .with_for_update()
            )

            if obj is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"{self.resource} record not found.",
                )

            before = self._snapshot(obj)

            setattr(
                obj,
                self.archive_field,
                self.archive_value,
            )

            if "published" in self.columns:
                obj.published = False

            if "updated_by" in self.columns:
                obj.updated_by = admin_id

            db.flush()

            after = self._snapshot(obj)

            record_admin_audit(
                db,
                admin_id=admin_id,
                action=f"{self.resource}.archived",
                entity=self.resource,
                entity_id=record_id,
                before=before,
                after=after,
                request=request,
            )

            db.commit()
            db.refresh(obj)

            return self._snapshot(obj)

        except Exception:
            db.rollback()
            raise
