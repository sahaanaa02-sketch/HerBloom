
import hashlib
import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
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
from app.services.ai_gateway import (
    generate_weekly_summary,
    AIUnavailable,
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


def build_ai_fingerprint(data):
    """
    Stable fingerprint of the aggregated report.
    No personal identifiers are included.
    """
    payload = json.dumps(
        data,
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )

    return hashlib.sha256(
        payload.encode("utf-8")
    ).hexdigest()


def get_or_generate_summary(
    db: Session,
    user_id: int,
    week_start: date,
    language: str,
    report_data: dict,
):
    """
    Reuse an existing weekly AI summary.

    MySQL advisory lock prevents simultaneous requests
    from generating duplicate summaries for the same week.

    Successful summaries are never regenerated for that week.
    """

    lock_name = f"hb_weekly_{user_id}_{week_start.isoformat()}"

    # Use a dedicated connection so the lock is tied
    # to this connection for its full lifetime.
    with db.get_bind().connect() as connection:
        acquired = connection.execute(
            text("SELECT GET_LOCK(:name, 15)"),
            {"name": lock_name},
        ).scalar()

        if acquired != 1:
            return None, "busy"

        try:
            cached = db.scalar(
                select(WeeklyReport).where(
                    WeeklyReport.user_id == user_id,
                    WeeklyReport.week_start == week_start,
                )
            )

            if cached and cached.summary_text:
                return cached.summary_text, "cached"

            # No names, journal content or chat history
            # are passed to generate_weekly_summary().
            try:
                summary = generate_weekly_summary(
                    weekly_data=report_data,
                    lang=language, db=db, user_id=user_id,
                )
            except AIUnavailable:
                return None, "unavailable"

            if cached is None:
                cached = WeeklyReport(
                    user_id=user_id,
                    week_start=week_start,
                    data_json=report_data,
                    summary_text=summary,
                    summary_language=language,
                )
                db.add(cached)
            else:
                cached.data_json = report_data
                cached.summary_text = summary
                cached.summary_language = language

            try:
                db.commit()
            except Exception:
                db.rollback()
                raise

            return summary, "generated"

        finally:
            connection.execute(
                text("SELECT RELEASE_LOCK(:name)"),
                {"name": lock_name},
            )


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

        if entitlements.ready(db):
            previous = db.scalar(select(WeeklyReport).where(
                WeeklyReport.user_id == current_user.id, WeeklyReport.week_start == week_start))
            summary = previous.summary_text if previous else None
            ai_status = "cached" if summary else "use_insights"
        else:
            summary, ai_status = get_or_generate_summary(
                db=db,
                user_id=current_user.id,
                week_start=week_start,
                language=language,
                report_data=report_data,
            )

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
