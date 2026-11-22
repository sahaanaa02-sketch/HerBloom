
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.mother_profile import MotherProfile
from app.models.weekly_report import WeeklyReport

from app.routers.auth import require_mother

from app.services.weekly_report_service import (
    calculate_weekly_report,
)
from app.services.weekly_rules import (
    evaluate_weekly_rules,
)
from app.config import get_weekly_thresholds
from app.services import entitlements


router = APIRouter(
    prefix="/reports",
    tags=["Weekly Summary"],
)


def preferred_language(profile):
    value = str(
        getattr(profile, "language", "en") or "en"
    ).lower()

    return "ta" if value.startswith("ta") else "en"


@router.get("/weekly")
def get_weekly_report(
    week_start: date | None = Query(
        default=None,
        description="Monday date in YYYY-MM-DD format",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_mother),
):
    today = date.today()

    if week_start is None:
        week_start = today - timedelta(
            days=today.weekday()
        )

    if week_start.weekday() != 0:
        raise HTTPException(
            status_code=422,
            detail="week_start must be a Monday.",
        )

    if week_start > today:
        raise HTTPException(
            status_code=422,
            detail="Future weeks are not available.",
        )

    profile = db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == current_user.id
        )
    )

    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="Mother profile not found.",
        )

    language = preferred_language(profile)

    try:
        report_data = calculate_weekly_report(
            db=db,
            user_id=current_user.id,
            week_start=week_start,
        )

        flags = evaluate_weekly_rules(
            report=report_data,
            profile=profile,
            thresholds=get_weekly_thresholds(),
        )

        # The report is local and read-only. New AI notes must go through the
        # consent and entitlement checks in the explicit Insights endpoint.
        previous = db.scalar(select(WeeklyReport).where(
            WeeklyReport.user_id == current_user.id, WeeklyReport.week_start == week_start))
        summary = previous.summary_text if previous else None
        ai_status = "cached" if summary else ("use_insights" if entitlements.ready(db) else "unavailable")

        return {
            "week_start": report_data["week_start"],
            "week_end": report_data["week_end"],
            "language": language,
            "data": report_data,
            "needs_attention": flags,
            "ai_summary": {
                "text": summary,
                "status": ai_status,
                "generated_by": (
                    "Gemini Flash-Lite"
                    if summary
                    else None
                ),
            },
        }

    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to load weekly report.",
        )
