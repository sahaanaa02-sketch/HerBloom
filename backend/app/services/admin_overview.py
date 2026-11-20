from datetime import datetime, time, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, case, column, func, inspect, select, text

from app.services.app_settings import read_settings
from app.models.admin import AdminUser, AuditLog
from app.models.chat import SafetyEvent
from app.models.user import User
from app.models.wellbeing import WellbeingCheckin
from app.routers.clinical_review import latest_publication_ids, visible_review_entities
from app.services import clinical_review as flow
from app.services.recovery_rules import COLOMBO, local_today


AUDIT_RESOURCE_LABELS = {
    "admin_auth": "Admin access", "admin_users": "Admin accounts", "articles": "Articles",
    "recovery_exercises": "Exercises", "wellbeing_activities": "Wellbeing activities", "meal_ideas": "Meal ideas",
    "media": "Media Library", "foods": "Food catalog", "food_aliases": "Food aliases",
    "unmatched_food_names": "Scanner names", "nutrition_target_values": "Nutrition targets",
    "warning_signs": "Warning signs", "red_flag_terms": "Red-flag terms", "safety_messages": "Safety messages",
    "helplines": "Helplines", "users": "Account administration",
    "app_settings": "App settings", "legal_pages": "Legal pages",
    "ai_settings": "AI settings", "prompt_versions": "AI prompts", "ai_feedback_reviews": "AI feedback",
}
AUDIT_ACTION_LABELS = {
    "created": "Created", "updated": "Updated", "archived": "Archived", "deleted": "Removed",
    "submitted_for_review": "Submitted for review", "approved": "Approved", "changes_requested": "Requested changes",
    "published": "Published", "reopened": "Reopened for editing", "resubmitted": "Submitted for re-review",
    "in_review": "Submitted for review", "requested": "Request opened", "confirmed": "Request confirmed",
    "rejected": "Request rejected", "downloaded": "Export downloaded", "export_generated": "Export prepared",
    "deactivate": "Account deactivated", "reactivate": "Account reactivated", "sent": "Account email sent",
    "delivery_failed": "Account email delivery failed", "password_verified": "Admin password verified",
    "activated": "Activated", "success": "Admin signed in", "failed": "Admin sign-in failed", "mapped": "Mapped to food",
}


def monday(day):
    return day - timedelta(days=day.weekday())


def boundary(day, clock):
    return datetime.combine(day, time.min, COLOMBO).astimezone(clock).replace(tzinfo=None)


def database_clock(db):
    # Legacy DATETIME defaults are in the MySQL session clock. A7 login activity uses UTC.
    seconds = db.scalar(text("SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), CURRENT_TIMESTAMP())"))
    return timezone(timedelta(seconds=seconds))


def safety_counts(db, end, clock):
    start = monday(end) - timedelta(weeks=3)
    weeks = [start + timedelta(weeks=i) for i in range(4)]
    event = SafetyEvent.__table__.c
    terms = []
    for week in weeks:
        lower = boundary(week, clock)
        upper = boundary(min(week + timedelta(weeks=1), end + timedelta(days=1)), clock)
        for kind in ("urgent", "crisis"):
            condition = and_(event.created_at >= lower, event.created_at < upper, event.category == kind)
            terms.append(func.count(case((condition, 1))))
    counts = db.execute(select(*terms).where(event.created_at >= boundary(start, clock),
                                           event.created_at < boundary(end + timedelta(days=1), clock),
                                           event.category.in_(("urgent", "crisis")))).one()
    return [{"week_start": week, "urgent": counts[2*i], "crisis": counts[2*i+1]}
            for i, week in enumerate(weeks)]


def review_counts(db, admin, today):
    entities = visible_review_entities(admin)
    if not entities or not flow.ready(db):
        return 0, 0
    reviews = flow.reflected(db, "content_reviews")
    publications = flow.reflected(db, "clinical_publications")
    pending = db.scalar(select(func.count()).select_from(reviews).where(
        reviews.c.entity.in_(entities), reviews.c.decision == "pending", reviews.c.superseded_at.is_(None)))
    overdue = db.scalar(select(func.count()).select_from(publications).where(
        publications.c.id.in_(latest_publication_ids(publications, entities)), publications.c.next_review_due < today))
    return pending, overdue


def recent_activity(db, clock):
    log = AuditLog.__table__.c
    action = case(AUDIT_ACTION_LABELS, value=func.substring_index(log.action, ".", -1), else_="Administrative action")
    resource = case(AUDIT_RESOURCE_LABELS, value=log.entity, else_="Administration")
    # Never return audit snapshots, event subjects, actor identity, IP addresses, or free text.
    rows = db.execute(select(log.id, action, resource, log.created_at).order_by(log.id.desc()).limit(10))
    return [{"id": id, "action": action, "entity": resource,
             "created_at": stamp.replace(tzinfo=clock).astimezone(timezone.utc)}
            for id, action, resource, stamp in rows]


def overview(db, admin, safety_date):
    today = local_today()
    if safety_date and (safety_date > today or safety_date.year < 2000):
        raise HTTPException(422, "Choose a safety chart date between 2000 and today.")
    end = safety_date or today
    start = monday(today)
    clock = database_clock(db)
    users = User.__table__.c
    has_last_active = "last_active_at" in {c["name"] for c in inspect(db.connection()).get_columns("users")}
    terms = [func.count(), func.count(case((users.is_active.is_(True), 1))),
             func.count(case((and_(users.created_at >= boundary(start, clock), users.created_at < boundary(today + timedelta(days=1), clock)), 1)))]
    if has_last_active:
        seen = column("last_active_at")
        terms.append(func.count(case((users.is_active.is_(True) & (seen >= boundary(start,timezone.utc))
                                     & (seen < boundary(start+timedelta(weeks=1),timezone.utc)), 1))))
    totals = db.execute(select(*terms).select_from(User.__table__).where(users.role == "MOTHER")).one()
    checkin = WellbeingCheckin.__table__.c
    checkins = db.scalar(select(func.count()).select_from(WellbeingCheckin.__table__)
                         .join(User, User.id == checkin.user_id).where(users.role == "MOTHER",
                         checkin.submitted_on >= start, checkin.submitted_on <= today))
    pending, overdue = review_counts(db, admin, today)
    stage2_enabled = read_settings(db).stage2_enabled
    result = {
        "total_mothers": totals[0], "active_mothers": totals[1], "new_this_week": totals[2],
        "active_this_week": totals[3] if has_last_active else None, "checkins_this_week": checkins,
        "total_admins": db.scalar(select(func.count(AdminUser.id))),
        "week_start": start, "as_of": today, "safety_as_of": end,
        "safety_counts_by_week": safety_counts(db, end, clock),
        "reviews_pending": pending, "reviews_overdue": overdue, "last_10_audit_entries": recent_activity(db,clock),
        "generated_at": datetime.now(timezone.utc), "stage2_enabled": stage2_enabled,
    }
    if stage2_enabled:
        # There is no billing, subscription, or AI cost ledger in the current schema.
        result.update(premium_subscribers=None, revenue_this_month=None, ai_cost_this_month=None)
    return result
