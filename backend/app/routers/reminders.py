
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.reminder import DashboardReminder

from app.routers.auth import require_mother

from app.schemas.dashboard import (
    ReminderCreate,
    ReminderUpdate,
    ReminderResponse,
)


router = APIRouter(
    prefix="/dashboard/reminders",
    tags=["Dashboard Reminders"],
)


# ----------------------------------------
# LIST REMINDERS
# ----------------------------------------

@router.get(
    "",
    response_model=list[ReminderResponse],
)
def get_reminders(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    return db.scalars(
        select(DashboardReminder)
        .where(
            DashboardReminder.user_id == user.id,
        )
        .order_by(
            DashboardReminder.remind_at.asc(),
            DashboardReminder.id.asc(),
        )
    ).all()


# ----------------------------------------
# CREATE REMINDER
# ----------------------------------------

@router.post(
    "",
    response_model=ReminderResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_reminder(
    payload: ReminderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    row = DashboardReminder(
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        remind_at=payload.remind_at,
        completed=False,
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return row


# ----------------------------------------
# UPDATE REMINDER
# ----------------------------------------

@router.patch(
    "/{reminder_id}",
    response_model=ReminderResponse,
)
def update_reminder(
    reminder_id: int,
    payload: ReminderUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    row = db.scalar(
        select(DashboardReminder).where(
            DashboardReminder.id == reminder_id,
            DashboardReminder.user_id == user.id,
        )
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Reminder not found.",
        )

    changes = payload.model_dump(
        exclude_unset=True,
    )

    for key, value in changes.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)

    return row


# ----------------------------------------
# DELETE REMINDER
# ----------------------------------------

@router.delete(
    "/{reminder_id}",
)
def delete_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    row = db.scalar(
        select(DashboardReminder).where(
            DashboardReminder.id == reminder_id,
            DashboardReminder.user_id == user.id,
        )
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Reminder not found.",
        )

    db.delete(row)
    db.commit()

    return {
        "message": "Reminder deleted successfully.",
    }
