
from datetime import date, timedelta
from zoneinfo import ZoneInfo
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.mother_profile import MotherProfile

from app.models.recovery import (
    SleepLog,
    WalkLog,
)

from app.models.hydration import HydrationLog
from app.models.todo import DashboardTodo


# ----------------------------------------
# SRI LANKA LOCAL DATE
# ----------------------------------------

SRI_LANKA_TZ = ZoneInfo("Asia/Colombo")


def local_today() -> date:
    return datetime.now(
        SRI_LANKA_TZ
    ).date()


# ----------------------------------------
# MOTHER PROFILE
# ----------------------------------------

def get_mother_profile(
    db: Session,
    user_id: int,
):
    return db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == user_id
        )
    )


# ----------------------------------------
# POSTPARTUM STAGE
# ----------------------------------------

def get_postpartum_stage(
    db: Session,
    user_id: int,
):
    profile = get_mother_profile(
        db,
        user_id,
    )

    if (
        profile is None
        or not profile.onboarding_done
        or profile.baby_birth_date is None
    ):
        return {
            "configured": False,
            "postpartum_day": None,
            "postpartum_week": None,
            "delivery_type": None,
            "birth_date": None,
            "message": (
                "Complete onboarding to view "
                "your recovery stage."
            ),
        }

    today = local_today()

    days_since_birth = (
        today - profile.baby_birth_date
    ).days

    if days_since_birth < 0:
        return {
            "configured": False,
            "postpartum_day": None,
            "postpartum_week": None,
            "delivery_type": None,
            "birth_date": None,
            "message": "Birth date cannot be in the future.",
        }

    delivery_type = (
        "c_section"
        if profile.delivery_type == "csection"
        else profile.delivery_type
    )

    return {
        "configured": True,
        "postpartum_day": days_since_birth + 1,
        "postpartum_week": days_since_birth // 7,
        "delivery_type": delivery_type,
        "birth_date": profile.baby_birth_date,
        "message": None,
    }


# ----------------------------------------
# TODAY WALKING
# ----------------------------------------

def get_today_walk_minutes(
    db: Session,
    user_id: int,
    today: date,
) -> int:
    result = db.scalar(
        select(
            func.coalesce(
                func.sum(WalkLog.minutes),
                0,
            )
        ).where(
            WalkLog.user_id == user_id,
            WalkLog.date == today,
        )
    )

    return int(result or 0)


# ----------------------------------------
# TODAY SLEEP
# ----------------------------------------

def get_today_sleep_hours(
    db: Session,
    user_id: int,
    today: date,
) -> float:
    result = db.scalar(
        select(
            func.coalesce(
                func.sum(SleepLog.hours),
                0,
            )
        ).where(
            SleepLog.user_id == user_id,
            SleepLog.date == today,
        )
    )

    return round(
        float(result or 0),
        2,
    )


# ----------------------------------------
# TODAY HYDRATION
# ----------------------------------------

def get_today_water_glasses(
    db: Session,
    user_id: int,
    today: date,
) -> int:
    row = db.scalar(
        select(HydrationLog).where(
            HydrationLog.user_id == user_id,
            HydrationLog.date == today,
        )
    )

    return row.glasses if row else 0


# ----------------------------------------
# WEEKLY SUMMARY
# ----------------------------------------

def get_weekly_summary(
    db: Session,
    user_id: int,
):
    today = local_today()

    start_date = today - timedelta(days=6)

    walks = db.scalars(
        select(WalkLog).where(
            WalkLog.user_id == user_id,
            WalkLog.date >= start_date,
            WalkLog.date <= today,
        )
    ).all()

    sleeps = db.scalars(
        select(SleepLog).where(
            SleepLog.user_id == user_id,
            SleepLog.date >= start_date,
            SleepLog.date <= today,
        )
    ).all()

    hydration_logs = db.scalars(
        select(HydrationLog).where(
            HydrationLog.user_id == user_id,
            HydrationLog.date >= start_date,
            HydrationLog.date <= today,
        )
    ).all()

    todos = db.scalars(
        select(DashboardTodo).where(
            DashboardTodo.user_id == user_id,
            DashboardTodo.date >= start_date,
            DashboardTodo.date <= today,
        )
    ).all()

    total_walk_minutes = sum(
        item.minutes for item in walks
    )

    total_sleep_hours = round(
        sum(item.hours for item in sleeps),
        2,
    )

    sleep_days = {
        item.date
        for item in sleeps
    }

    average_sleep_hours = (
        round(
            total_sleep_hours / len(sleep_days),
            2,
        )
        if sleep_days
        else None
    )

    total_water_glasses = sum(
        item.glasses
        for item in hydration_logs
    )

    completed_tasks = sum(
        1
        for item in todos
        if item.done
    )

    walking_days = len({
        item.date
        for item in walks
        if item.minutes > 0
    })

    return {
        "start_date": start_date,
        "end_date": today,
        "total_walk_minutes": total_walk_minutes,
        "total_sleep_hours": total_sleep_hours,
        "average_sleep_hours": average_sleep_hours,
        "total_water_glasses": total_water_glasses,
        "completed_tasks": completed_tasks,
        "total_tasks": len(todos),
        "walking_days": walking_days,
    }


# ----------------------------------------
# DASHBOARD ALERTS
# ----------------------------------------

def get_dashboard_alerts(
    db: Session,
    user_id: int,
):
    profile = get_mother_profile(
        db,
        user_id,
    )

    alerts = []

    if profile is None:
        return alerts

    if not profile.onboarding_done:
        alerts.append({
            "type": "info",
            "title": "Complete Your Profile",
            "message": (
                "Finish onboarding to receive "
                "personalized recovery information."
            ),
        })

    return alerts


# ----------------------------------------
# TODAY DASHBOARD OVERVIEW
# ----------------------------------------

def get_today_dashboard(
    db: Session,
    user_id: int,
):
    today = local_today()

    return {
        "date": today,
        "walk_minutes": get_today_walk_minutes(
            db,
            user_id,
            today,
        ),
        "sleep_hours": get_today_sleep_hours(
            db,
            user_id,
            today,
        ),
        "water_glasses": get_today_water_glasses(
            db,
            user_id,
            today,
        ),
        "meals_logged": None,
        "alerts": get_dashboard_alerts(
            db,
            user_id,
        ),
        "weekly_summary": get_weekly_summary(
            db,
            user_id,
        ),
    }
