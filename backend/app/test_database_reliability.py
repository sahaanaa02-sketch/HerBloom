from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.e2e_guard import preflight
from app.models.hydration import HydrationLog
from app.models.user import User
from app.routers.dashboard import add_hydration, local_today
from app.schemas.dashboard import HydrationAdd, ReminderUpdate, TodoUpdate


@pytest.mark.parametrize(
    ("schema", "fields"),
    [(TodoUpdate, ("title", "done")), (ReminderUpdate, ("title", "remind_at", "completed"))],
)
def test_patch_rejects_explicit_null_in_non_nullable_fields(schema, fields):
    from pydantic import ValidationError

    assert schema().model_dump(exclude_unset=True) == {}
    for field in fields:
        with pytest.raises(ValidationError):
            schema.model_validate({field: None})
    assert ReminderUpdate(description=None).model_dump(exclude_unset=True) == {"description": None}


def test_concurrent_hydration_writes_and_unique_constraint_recovery():
    preflight()
    identifier = f"hydration-e2e-{uuid4().hex}"
    with SessionLocal.begin() as db:
        user = User(username=identifier, email=f"{identifier}@example.invalid",
                    full_name="Synthetic hydration test", hashed_password="unusable")
        db.add(user)
        db.flush()
        user_id = user.id

    def add_pair():
        start = Barrier(2)

        def add():
            with SessionLocal() as db:
                user = db.get(User, user_id)
                start.wait(timeout=10)
                return add_hydration(HydrationAdd(glasses=1), db, user).id

        with ThreadPoolExecutor(max_workers=2) as pool:
            requests = [pool.submit(add) for _ in range(2)]
            return [request.result(timeout=20) for request in requests]

    try:
        ids = add_pair()
        assert ids[0] == ids[1]
        assert add_pair() == ids
        with SessionLocal() as db:
            row = db.scalars(select(HydrationLog).where(HydrationLog.user_id == user_id)).one()
            assert row.glasses == 4
            db.add(HydrationLog(user_id=user_id, date=local_today(), glasses=2))
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()
            assert db.get(HydrationLog, ids[0]).glasses == 4
    finally:
        with SessionLocal.begin() as db:
            db.execute(delete(User).where(User.id == user_id, User.username == identifier))
