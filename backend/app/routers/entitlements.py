"""Authenticated plan and entitlement APIs."""
from datetime import UTC
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.routers.auth import require_mother
from app.services import billing, entitlements, free_quota, weekly_insights

router = APIRouter(tags=["Mother entitlements"])
Db = Annotated[Session, Depends(get_db)]
Mother = Annotated[User, Depends(require_mother)]


class TrialOptIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: Literal[True]


def status(db, user_id, state):
    return {
        "plan": state.code,
        "expires_at": state.access_ends.replace(tzinfo=UTC) if state.access_ends else None,
        "trial_eligible": state.trial_eligible,
        "guided_exercises": state.code != "free",
        "weekly_insights": state.code != "free",
        "quota_resets_at": state.ends.replace(tzinfo=UTC),
        "remaining": entitlements.remaining(db, user_id, state),
    }


@router.get("/api/plans")
def plans(user: Mother, db: Db):
    entitlements.require_ready(db)
    state = entitlements.current(db, user.id, free_quota.utc_now())
    return {"trial_eligible": state.trial_eligible,
            "plans": [{"code": key, "price_lkr": plan["price_lkr"], "duration_days": plan["duration_days"],
                       "limits": dict(plan["limits"])} for key, plan in entitlements.PLANS.items()]}


@router.get("/api/features/entitlements")
def current(user: Mother, db: Db):
    entitlements.require_ready(db)
    return status(db, user.id, entitlements.current(db, user.id, free_quota.utc_now()))


@router.get("/api/billing/me")
def my_plan(user: Mother, db: Db):
    data = current(user, db)
    return dict(data, sandbox_checkout=billing.available(db), order_history=billing.history(db, user.id))


@router.post("/api/billing/trial/start", status_code=201)
def start_trial(body: TrialOptIn, user: Mother, db: Db):
    user_id = user.id
    state = entitlements.start_trial(db, user_id)
    result = status(db, user_id, state)
    db.commit()
    return result


@router.get("/insights/weekly")
def insights(user: Mother, db: Db, before: int | None = Query(None, ge=1)):
    entitlements.require_ready(db)
    now = free_quota.utc_now()
    state = entitlements.current(db, user.id, now)
    reason, _, _ = weekly_insights.eligibility(db, user.id, state, now)
    rows = weekly_insights.history(db, user.id, before)
    return {"eligibility": reason, "items": rows, "next_before": rows[-1]["id"] if len(rows) == 20 else None}


@router.post("/insights/weekly/generate", status_code=201)
def generate(user: Mother, db: Db):
    return weekly_insights.generate(db, user.id)
