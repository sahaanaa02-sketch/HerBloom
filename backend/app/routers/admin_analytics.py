from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import require_admin_permission
from app.models.admin import AdminUser
from app.services import analytics
from app.services.recovery_rules import local_today

router = APIRouter(prefix="/api/admin/analytics", tags=["Admin analytics"])
Viewer = Annotated[AdminUser, Depends(require_admin_permission("analytics.view"))]
Db = Annotated[Session, Depends(get_db)]


def dates(start: date | None = None, end: date | None = None):
    today = local_today()
    end = end or today
    if end < date(2000,1,1) or end > today:
        raise HTTPException(422, "End date is outside the supported range.")
    start = start or end - timedelta(days=27)
    if start < date(2000,1,1) or start > end or (end-start).days >= 366:
        raise HTTPException(422, "Select a valid date range of up to 366 days.")
    return start,end


Range = Annotated[tuple[date,date], Depends(dates)]


@router.get("")
def overview(admin: Viewer, db: Db, span: Range):
    if not analytics.ready(db):
        raise HTTPException(503, "Analytics schema is unavailable.")
    return analytics.report(db, *span)


@router.get("/export.csv")
def export(admin: Viewer, db: Db, span: Range):
    return Response(analytics.csv_report(overview(admin, db, span)), media_type="text/csv",
                    headers={"Content-Disposition":"attachment; filename=herbloom-analytics.csv",
                             "Cache-Control":"no-store"})
