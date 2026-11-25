
from __future__ import annotations

from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    Query,
    Request,
)
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import (
    require_admin_permission,
)
from app.models.admin import AdminUser
from app.services.admin_crud import AdminCRUD


class CRUDPayload(BaseModel):
    model_config = ConfigDict(extra="allow")


def create_admin_crud_router(
    *,
    crud: AdminCRUD,
    read_permission: str,
    write_permission: str,
    archive_permission: str | None = None,
) -> APIRouter:
    """
    Create reusable Admin CRUD endpoints for one resource.

    Every endpoint checks the appropriate Admin permission.
    Only explicitly configured resource fields are editable.
    """

    router = APIRouter(
        prefix=f"/api/admin/{crud.resource}",
        tags=[f"Admin - {crud.resource.title()}"],
    )

    archive_permission = (
        archive_permission or write_permission
    )

    @router.get("")
    def list_records(
        page: int = Query(default=1, ge=1),
        page_size: int = Query(
            default=20,
            ge=1,
            le=100,
        ),
        search: str | None = None,
        status: str | None = None,
        category: str | None = None,
        db: Session = Depends(get_db),
        admin: AdminUser = Depends(
            require_admin_permission(read_permission)
        ),
    ):
        filters: dict[str, Any] = {}

        if status is not None:
            filters["status"] = status

        if category is not None:
            filters["category"] = category

        return crud.list_records(
            db,
            page=page,
            page_size=page_size,
            search=search,
            filters=filters,
        )

    @router.get("/{record_id}")
    def get_record(
        record_id: int,
        db: Session = Depends(get_db),
        admin: AdminUser = Depends(
            require_admin_permission(read_permission)
        ),
    ):
        return crud.get_record(
            db,
            record_id,
        )

    @router.post("", status_code=201)
    def create_record(
        payload: CRUDPayload,
        request: Request,
        db: Session = Depends(get_db),
        admin: AdminUser = Depends(
            require_admin_permission(write_permission)
        ),
    ):
        return crud.create_record(
            db,
            admin_id=admin.id,
            payload=payload.model_dump(
                exclude_unset=True
            ),
            request=request,
        )

    @router.patch("/{record_id}")
    def update_record(
        record_id: int,
        payload: CRUDPayload,
        request: Request,
        db: Session = Depends(get_db),
        admin: AdminUser = Depends(
            require_admin_permission(write_permission)
        ),
    ):
        return crud.update_record(
            db,
            record_id,
            admin_id=admin.id,
            payload=payload.model_dump(
                exclude_unset=True
            ),
            request=request,
        )

    @router.delete("/{record_id}")
    def archive_record(
        record_id: int,
        request: Request,
        db: Session = Depends(get_db),
        admin: AdminUser = Depends(
            require_admin_permission(
                archive_permission
            )
        ),
    ):
        return crud.archive_record(
            db,
            record_id,
            admin_id=admin.id,
            request=request,
        )

    return router
