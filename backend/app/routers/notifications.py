"""In-app notification content, targeting and editorial actions."""
from datetime import timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import and_, column, false, func, inspect, literal, or_, select, table as table_clause
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import require_admin_permission
from app.models.admin import AdminUser
from app.models.mother_profile import MotherProfile
from app.models.user import User
from app.routers.auth import require_mother
from app.services import clinical_review as review
from app.services.admin_audit import record_admin_audit
from app.services.recovery_rules import local_today

admin_router = APIRouter(prefix="/api/admin/notifications", tags=["Admin Notifications"])
mother_router = APIRouter(tags=["Mother Notifications"])
Db = Annotated[Session, Depends(get_db)]
Viewer = Annotated[AdminUser, Depends(require_admin_permission("notifications.view"))]
Editor = Annotated[AdminUser, Depends(require_admin_permission("notifications.create"))]
Publisher = Annotated[AdminUser, Depends(require_admin_permission("notifications.send"))]
Manager = Annotated[AdminUser, Depends(require_admin_permission("notifications.manage"))]
Mother = Annotated[User, Depends(require_mother)]
Resource = Literal["announcements", "daily_tips", "reminder_templates"]
Week = Annotated[int, Field(ge=0, le=65535)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]
ReminderKey = Literal["water", "rest", "mood", "meals", "recovery", "medicine", "appointment", "gdm_test"]
account_plans = table_clause("v_admin_users", column("id"), column("plan_name"))


class Audience(BaseModel):
    model_config = ConfigDict(extra="forbid")
    week_min: Week | None = None
    week_max: Week | None = None
    delivery_type: Literal["vaginal", "csection"] | None = None
    language: Literal["en", "ta"] | None = None
    plan: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)] | None = None

    @model_validator(mode="after")
    def ordered_weeks(self):
        if self.week_min is not None and self.week_max is not None and self.week_min > self.week_max:
            raise ValueError("Minimum week must be at or below maximum week.")
        return self


class Announcement(Audience):
    title_en: Title
    title_ta: Title
    body_en: Body
    body_ta: Body
    channel: Literal["banner", "bell"]
    start_at: AwareDatetime
    end_at: AwareDatetime

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.end_at <= self.start_at:
            raise ValueError("End time must be after start time.")
        return self


class Template(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: ReminderKey
    text_en: Body
    text_ta: Body


class Tip(BaseModel):
    model_config = ConfigDict(extra="forbid")
    week: Week
    text_en: Body
    text_ta: Body


def ready(db):
    return inspect(db.connection()).has_table("reminder_templates")


def table(db, resource):
    if not ready(db):
        raise HTTPException(503, "Notifications are awaiting their database migration.")
    return review.reflected(db, resource)


def status_conditions(t, stamp):
    return {
        "draft": t.c.status == "draft",
        "scheduled": and_(t.c.status == "published", t.c.start_at > stamp),
        "active": and_(t.c.status == "published", t.c.start_at <= stamp, t.c.end_at > stamp),
        "expired": and_(t.c.status == "published", t.c.end_at <= stamp),
    }


def present(resource, record, stamp):
    if resource != "announcements":
        return dict(record)
    state = "draft"
    if record["status"] == "published":
        state = "scheduled" if record["start_at"] > stamp else "expired" if record["end_at"] <= stamp else "active"
    return dict(record, lifecycle=state, start_at=record["start_at"].replace(tzinfo=timezone.utc),
                end_at=record["end_at"].replace(tzinfo=timezone.utc))


def postpartum_week():
    today = local_today()
    days = func.datediff(today, MotherProfile.baby_birth_date)
    return func.if_(days >= 0, func.floor(days / 7), None)


def eligible(week_min, week_max, delivery_type, language, plan):
    week = postpartum_week()
    assigned_plan = select(account_plans.c.id).where(
        account_plans.c.id == User.id, account_plans.c.plan_name == plan
    ).correlate(User.__table__).exists()
    return and_(
        or_(week_min.is_(None), week >= week_min),
        or_(week_max.is_(None), week <= week_max),
        or_(delivery_type.is_(None), MotherProfile.delivery_type == delivery_type),
        or_(language.is_(None), MotherProfile.language == language),
        # The existing account view reports NULL when no entitlement is known.
        or_(plan.is_(None), assigned_plan),
    )


@admin_router.post("/announcements/audience-preview")
def preview(body: Audience, admin: Viewer, db: Db):
    table(db, "announcements")
    targeting = {name: literal(value) for name, value in body.model_dump().items()}
    q = select(func.count(User.id)).outerjoin(MotherProfile, MotherProfile.user_id == User.id).where(
        User.role == "MOTHER", User.is_active.is_(True), eligible(**targeting))
    return {"count": db.scalar(q)}


@admin_router.get("/{resource}")
def list_records(resource: Resource, admin: Viewer, db: Db, search: str = Query("", max_length=180),
                 status: str | None = None, page: int = Query(1, ge=1, le=100000),
                 page_size: int = Query(10, ge=1, le=100)):
    t = table(db, resource)
    stamp = review.now()
    q = select(t)
    if search.strip():
        columns = (t.c.title_en, t.c.title_ta) if resource == "announcements" else (t.c.text_en, t.c.text_ta)
        q = q.where(or_(*(column.contains(search.strip(), autoescape=True) for column in columns)))
    if status:
        q = q.where(status_conditions(t, stamp).get(status, false()) if resource == "announcements"
                    else t.c.status == status)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    records = db.execute(q.order_by(t.c.id.desc()).offset((page - 1) * page_size).limit(page_size))
    return {"items": [present(resource, row, stamp) for row in records.mappings()], "total": total}


@admin_router.get("/{resource}/{id}")
def detail(resource: Resource, id: int, admin: Viewer, db: Db):
    return present(resource, review.row(db, table(db, resource), id), review.now())


def write(db, resource, request, admin, action, t, id, before, values):
    try:
        if id is None:
            id = db.execute(t.insert().values(**values)).inserted_primary_key[0]
        else:
            review.update_state(db, t, id, **values)
        after = review.row(db, t, id)
        if action == "submit":
            review.submit(db, resource, id, admin.id)
        if resource == "daily_tips" and action == "archive":
            review.supersede(db, resource, id)
        record_admin_audit(db, admin_id=admin.id, request=request, action="notifications." + action,
                           entity=resource, entity_id=id, before=jsonable_encoder(before), after=jsonable_encoder(after))
        db.commit()
        return present(resource, after, review.now())
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "The notification conflicts with an existing record.") from None


def save(db, resource, body, request, admin, id=None):
    t = table(db, resource)
    before = review.row(db, t, id, lock=True) if id is not None else None
    if before and before["status"] != "draft":
        raise HTTPException(409, "Only drafts can be edited.")
    values = body.model_dump()
    if resource == "announcements":
        for field in ("start_at", "end_at"):
            values[field] = values[field].astimezone(timezone.utc).replace(tzinfo=None)
    return write(db, resource, request, admin, "updated" if before else "created", t, id, before, values)


@admin_router.post("/announcements", status_code=201)
def create_announcement(body: Announcement, request: Request, admin: Editor, db: Db):
    return save(db, "announcements", body, request, admin)


@admin_router.put("/announcements/{id}")
def edit_announcement(id: int, body: Announcement, request: Request, admin: Editor, db: Db):
    return save(db, "announcements", body, request, admin, id)


@admin_router.delete("/announcements/{id}")
def delete_announcement(id: int, request: Request, admin: Manager, db: Db):
    t = table(db, "announcements")
    before = review.row(db, t, id, lock=True)
    if before["status"] != "draft":
        raise HTTPException(409, "Unpublish the announcement before deleting it.")
    db.execute(t.delete().where(t.c.id == id))
    record_admin_audit(db, admin_id=admin.id, request=request, action="notifications.deleted",
                       entity="announcements", entity_id=id, before=jsonable_encoder(before))
    db.commit()
    return {"id": id}


@admin_router.post("/daily_tips", status_code=201)
def create_tip(body: Tip, request: Request, admin: Editor, db: Db):
    return save(db, "daily_tips", body, request, admin)


@admin_router.put("/daily_tips/{id}")
def edit_tip(id: int, body: Tip, request: Request, admin: Editor, db: Db):
    return save(db, "daily_tips", body, request, admin, id)


@admin_router.post("/reminder_templates", status_code=201)
def create_template(body: Template, request: Request, admin: Editor, db: Db):
    return save(db, "reminder_templates", body, request, admin)


@admin_router.put("/reminder_templates/{id}")
def edit_template(id: int, body: Template, request: Request, admin: Editor, db: Db):
    return save(db, "reminder_templates", body, request, admin, id)


@admin_router.post("/{resource}/{id}/publication")
def publication(resource: Literal["announcements", "reminder_templates"], id: int,
                action: Literal["publish", "unpublish"], request: Request, admin: Publisher, db: Db):
    t = table(db, resource)
    before = review.row(db, t, id, lock=True)
    if action == "publish" and resource == "announcements" and before["end_at"] <= review.now():
        raise HTTPException(409, "Set a future end time before publishing.")
    old, new = ("draft", "published") if action == "publish" else ("published", "draft")
    if before["status"] != old:
        raise HTTPException(409, "This publication transition is not available.")
    return write(db, resource, request, admin, action, t, id, before, {"status": new})


@admin_router.post("/daily_tips/{id}/editorial")
def tip_editorial(id: int, action: Literal["submit", "archive"], request: Request, admin: Editor, db: Db):
    t = table(db, "daily_tips")
    before = review.row(db, t, id, lock=True)
    if action == "submit":
        review.require_ready(db)
        if before["status"] != "draft":
            raise HTTPException(409, "Only drafts can be submitted.")
    elif before["status"] not in {"draft", "in_review"}:
        raise HTTPException(409, "Only drafts and in-review tips can be archived.")
    return write(db, "daily_tips", request, admin, action, t, id, before,
                 {"status": "in_review" if action == "submit" else "archived",
                  "reviewed_by": None, "reviewed_at": None})


@mother_router.get("/announcements/active")
def active_announcements(user: Mother, db: Db):
    if not ready(db):
        return []
    t = review.reflected(db, "announcements")
    lang = func.coalesce(MotherProfile.language, "en")
    q = select(t.c.id, t.c.channel, func.if_(lang == "ta", t.c.title_ta, t.c.title_en).label("title"),
               func.if_(lang == "ta", t.c.body_ta, t.c.body_en).label("body")).select_from(
        User.__table__.outerjoin(MotherProfile, MotherProfile.user_id == User.id).join(
            t, eligible(t.c.week_min, t.c.week_max, t.c.delivery_type, t.c.language, t.c.plan))
    ).where(User.id == user.id, status_conditions(t, review.now())["active"]).order_by(t.c.start_at.desc(), t.c.id.desc())
    return [dict(row) for row in db.execute(q).mappings()]


@mother_router.get("/daily-tips/active")
def active_tip(user: Mother, db: Db):
    if not ready(db) or not review.ready(db):
        return None
    t = review.reflected(db, "daily_tips")
    p = review.reflected(db, "clinical_publications")
    q = select(t.c.week, func.if_(MotherProfile.language == "ta", t.c.text_ta, t.c.text_en).label("text")).select_from(
        MotherProfile.__table__.join(t, t.c.week == postpartum_week()).join(
            p, and_(p.c.entity == "daily_tips", p.c.entity_id == t.c.id))
    ).where(MotherProfile.user_id == user.id, t.c.status == "published", t.c.reviewed_at.is_not(None)
            ).order_by(p.c.id.desc()).limit(1)
    row = db.execute(q).mappings().first()
    return dict(row) if row else None


@mother_router.get("/dashboard/reminders/templates")
def active_templates(user: Mother, db: Db):
    if not ready(db):
        return []
    profile = db.scalar(select(MotherProfile).where(MotherProfile.user_id == user.id))
    if not profile:
        return []
    aliases = {"exercises": "recovery", "appointments": "appointment"}
    keys = [aliases.get(key, key) for key in (profile.reminders or []) if isinstance(key, str)]
    if not keys:
        return []
    t = review.reflected(db, "reminder_templates")
    text = t.c.text_ta if profile.language == "ta" else t.c.text_en
    return [dict(row) for row in db.execute(select(t.c.key, text.label("text")).where(
        t.c.status == "published", t.c.key.in_(keys)).order_by(t.c.key)).mappings()]
