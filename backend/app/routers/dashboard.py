
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.hydration import HydrationLog

from app.routers.auth import require_mother

from app.schemas.dashboard import (
    DashboardStageResponse,
    DashboardTodayResponse,
    DashboardWeeklyResponse,
    HydrationAdd,
    HydrationSet,
    HydrationResponse,
)

from app.services.dashboard_service import (
    local_today,
    get_postpartum_stage,
    get_today_dashboard,
    get_weekly_summary,
)


router = APIRouter(
    prefix="/dashboard",
    tags=["Mother Dashboard"],
)


# ----------------------------------------
# TODAY OVERVIEW
# ----------------------------------------

@router.get(
    "/today",
    response_model=DashboardTodayResponse,
)
def dashboard_today(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    return get_today_dashboard(
        db,
        user.id,
    )


# ----------------------------------------
# POSTPARTUM STAGE
# ----------------------------------------

@router.get(
    "/stage",
    response_model=DashboardStageResponse,
)
def dashboard_stage(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    return get_postpartum_stage(
        db,
        user.id,
    )


# ----------------------------------------
# WEEKLY SUMMARY
# ----------------------------------------

@router.get(
    "/weekly",
    response_model=DashboardWeeklyResponse,
)
def dashboard_weekly(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    return get_weekly_summary(
        db,
        user.id,
    )


# ----------------------------------------
# HYDRATION HELPERS
# ----------------------------------------

def find_today_hydration(
    db: Session,
    user_id: int,
):
    return db.scalar(
        select(HydrationLog).where(
            HydrationLog.user_id == user_id,
            HydrationLog.date == local_today(),
        )
    )


def find_hydration_for_update(db: Session, user_id: int, today: date):
    # Lock the parent even when no hydration row exists yet. The locking read
    # also sees the latest committed row under MySQL REPEATABLE READ.
    db.execute(select(User.id).where(User.id == user_id).with_for_update()).scalar_one()
    return db.scalar(
        select(HydrationLog)
        .where(HydrationLog.user_id == user_id, HydrationLog.date == today)
        .with_for_update()
    )


# ----------------------------------------
# GET TODAY HYDRATION
# ----------------------------------------

@router.get(
    "/hydration",
    response_model=HydrationResponse | None,
)
def get_hydration(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    return find_today_hydration(
        db,
        user.id,
    )


# ----------------------------------------
# ADD WATER GLASSES
# ----------------------------------------

@router.post(
    "/hydration/add",
    response_model=HydrationResponse,
)
def add_hydration(
    payload: HydrationAdd,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    today = local_today()

    row = find_hydration_for_update(db, user.id, today)

    if row is None:
        row = HydrationLog(
            user_id=user.id,
            date=today,
            glasses=payload.glasses,
        )
        db.add(row)

    else:
        if row.glasses + payload.glasses > 50:
            raise HTTPException(
                status_code=422,
                detail="Maximum recordable glasses is 50.",
            )

        row.glasses += payload.glasses

    try:
        db.commit()
        db.refresh(row)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Hydration record conflict. Please retry.",
        )

    return row


# ----------------------------------------
# SET TODAY WATER COUNT
# ----------------------------------------

@router.put(
    "/hydration",
    response_model=HydrationResponse,
)
def set_hydration(
    payload: HydrationSet,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    today = local_today()
    row = find_hydration_for_update(db, user.id, today)

    if row is None:
        row = HydrationLog(
            user_id=user.id,
            date=today,
            glasses=payload.glasses,
        )

        db.add(row)

    else:
        row.glasses = payload.glasses

    try:
        db.commit()
        db.refresh(row)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Hydration record conflict. Please retry.",
        )

    return row
