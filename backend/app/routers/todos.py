
from datetime import date as Date

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
from app.models.todo import DashboardTodo

from app.routers.auth import require_mother

from app.schemas.dashboard import (
    TodoCreate,
    TodoUpdate,
    TodoResponse,
)

from app.services.dashboard_service import local_today


router = APIRouter(
    prefix="/dashboard/todos",
    tags=["Dashboard To-Do"],
)


# ----------------------------------------
# GET DAILY TASKS
# ----------------------------------------

@router.get(
    "",
    response_model=list[TodoResponse],
)
def get_todos(
    target_date: Date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    selected_date = target_date or local_today()

    return db.scalars(
        select(DashboardTodo)
        .where(
            DashboardTodo.user_id == user.id,
            DashboardTodo.date == selected_date,
        )
        .order_by(
            DashboardTodo.created_at.asc(),
            DashboardTodo.id.asc(),
        )
    ).all()


# ----------------------------------------
# CREATE TASK
# ----------------------------------------

@router.post(
    "",
    response_model=TodoResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_todo(
    payload: TodoCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    selected_date = payload.date or local_today()

    row = DashboardTodo(
        user_id=user.id,
        title=payload.title,
        date=selected_date,
        done=False,
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return row


# ----------------------------------------
# UPDATE TASK
# ----------------------------------------

@router.patch(
    "/{todo_id}",
    response_model=TodoResponse,
)
def update_todo(
    todo_id: int,
    payload: TodoUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    row = db.scalar(
        select(DashboardTodo).where(
            DashboardTodo.id == todo_id,
            DashboardTodo.user_id == user.id,
        )
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found.",
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
# DELETE TASK
# ----------------------------------------

@router.delete(
    "/{todo_id}",
)
def delete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    row = db.scalar(
        select(DashboardTodo).where(
            DashboardTodo.id == todo_id,
            DashboardTodo.user_id == user.id,
        )
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Task not found.",
        )

    db.delete(row)
    db.commit()

    return {
        "message": "Task deleted successfully.",
    }
