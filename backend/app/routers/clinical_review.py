from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import get_admin_permissions, get_current_admin
from app.models.admin import AdminUser
from app.services import clinical_review as flow
from app.services.admin_audit import record_admin_audit

router = APIRouter(prefix="/api/admin/reviews", tags=["Clinical Review"])
Db = Annotated[Session, Depends(get_db)]
Admin = Annotated[AdminUser, Depends(get_current_admin)]


class Comment(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    comment: str = Field(min_length=1, max_length=4000)


def access(admin, entity, intent):
    permissions = set(get_admin_permissions(admin))
    if entity not in flow.ENTITIES:
        raise HTTPException(404, "Unknown review resource.")
    group = flow.ENTITIES[entity][0]
    if entity == "daily_tips" and intent == "edit":
        return "notifications.create" in permissions
    keys = {f"{group}.approve"} if intent == "approve" else (
        {f"{group}.edit"} if intent == "edit" else
        {f"{group}.view", f"{group}.edit", f"{group}.approve"})
    return bool(permissions & keys)


def authorize(admin, entity, intent="approve"):
    if not access(admin, entity, intent):
        raise HTTPException(403, "Permission denied for this review resource.")


def visible_review_entities(admin):
    return [entity for entity in flow.ENTITIES if access(admin, entity, "view")]


def permitted(admin):
    allowed = visible_review_entities(admin)
    if not allowed:
        raise HTTPException(403, "Review access is required.")
    return allowed


def person(db, id):
    admin = db.get(AdminUser, id) if id is not None else None
    return admin.name if admin else None


def title(entity, snapshot):
    value = snapshot.get(flow.ENTITIES[entity][1]) or entity
    if entity == "nutrition_target_values":
        value = f"{snapshot['feeding_group']} / {value}"
    return value[:150]


def summary(db, review):
    data = {k: v for k, v in review.items() if k not in {"submitted_snapshot", "revision_hash"}}
    return {**data, "title": title(review["entity"], review["submitted_snapshot"]),
            "submitter": person(db, review["submitted_by"]),
            "waiting_days": max(0, ((review["decided_at"] or flow.now()).date() - review["created_at"].date()).days)}


@router.get("")
def queue(admin: Admin, db: Db, entity: str | None = None,
          status: Literal["pending", "approved", "changes_requested", "superseded", "all"] = "pending",
          page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100)):
    allowed = permitted(admin)
    if entity:
        authorize(admin, entity, "view")
        allowed = [entity]
    flow.require_ready(db)
    t = flow.reflected(db, "content_reviews")
    filters = [t.c.entity.in_(allowed)]
    if status == "superseded":
        filters.append(t.c.superseded_at.is_not(None))
    elif status != "all":
        filters.extend((t.c.decision == status, t.c.superseded_at.is_(None)))
    stmt = select(t).where(*filters)
    items = db.execute(stmt.order_by(t.c.created_at, t.c.id).offset((page - 1) * page_size).limit(page_size)).mappings()
    return {"items": [summary(db, r) for r in items],
            "total": db.scalar(select(func.count()).select_from(stmt.subquery())),
            "entities": allowed}


def latest_publication_ids(publications, entities):
    return (select(func.max(publications.c.id)).where(publications.c.entity.in_(entities))
            .group_by(publications.c.entity, publications.c.series_key))


def due_rows(admin, db):
    allowed = permitted(admin)
    if not flow.ready(db):
        return []
    t = flow.reflected(db, "clinical_publications")
    latest = latest_publication_ids(t, allowed)
    cutoff = flow.now().date() + timedelta(days=30)
    return list(db.execute(select(t).where(t.c.id.in_(latest), t.c.next_review_due <= cutoff)
                           .order_by(t.c.next_review_due, t.c.id)).mappings())


@router.get("/due")
def due(admin: Admin, db: Db):
    today = flow.now().date()
    return [{k: r[k] for k in ("id", "entity", "entity_id", "review_id", "next_review_due")} |
            {"title": title(r["entity"], r["snapshot"]), "overdue": r["next_review_due"] < today}
            for r in due_rows(admin, db)]


@router.get("/{id:int}")
def details(id: int, admin: Admin, db: Db):
    permitted(admin)
    flow.require_ready(db)
    t = flow.reflected(db, "content_reviews")
    review = flow.row(db, t, id)
    entity = review["entity"]
    authorize(admin, entity, "view")
    content = flow.reflected(db, entity)
    record = flow.row(db, content, review["entity_id"])
    current = flow.snapshot(db, entity, record)
    publications = flow.reflected(db, "clinical_publications")
    own = db.scalar(select(publications.c.id).where(publications.c.review_id == id))
    previous = flow.last_publication(db, entity, record) if own is None else db.execute(
        select(publications).where(publications.c.entity == entity,
                                   publications.c.series_key == flow.series(entity, record),
                                   publications.c.id < own).order_by(publications.c.id.desc()).limit(1)).mappings().first()
    active = review["superseded_at"] is None and flow.fingerprint(current) == review["revision_hash"]
    in_review = record[flow.status_field(content)] == "in_review"
    eligible = active and not own and (in_review or flow.is_live(entity, record))
    history = db.execute(select(t).where(t.c.entity == entity, t.c.entity_id == record["id"])
                         .order_by(t.c.id.desc())).mappings()
    return {**summary(db, review), "reviewer": person(db, review["reviewer_id"]),
            "reviewed_by": review["reviewer_id"], "reviewed_at": review["decided_at"] if review["decision"] == "approved" else None,
            "current": review["submitted_snapshot"], "previous": previous["snapshot"] if previous else None,
            "history": [summary(db, item) for item in history],
            "published": own is not None,
            "can_decide": eligible and review["decision"] == "pending" and access(admin, entity, "approve"),
            "can_publish": eligible and review["decision"] == "approved" and access(admin, entity, "approve")
                           and review["next_review_due"] is not None and review["next_review_due"] >= flow.now().date(),
            "can_revise": in_review and access(admin, entity, "edit") and can_revise_entity(entity),
            "can_resubmit": own is not None and flow.is_live(entity, record) and access(admin, entity, "edit")}


def can_revise_entity(entity):
    return flow.ENTITIES[entity][0] != "safety"


@router.post("/{id:int}/approve")
def approve(id: int, request: Request, admin: Admin, db: Db):
    return flow.record_decision(db, id, "approved", None, admin, request, authorize)


@router.post("/{id:int}/request-changes")
def changes(id: int, body: Comment, request: Request, admin: Admin, db: Db):
    return flow.record_decision(db, id, "changes_requested", body.comment, admin, request, authorize)


@router.post("/{id:int}/publish")
def publish(id: int, request: Request, admin: Admin, db: Db):
    return flow.publish(db, id, admin, request, authorize, person)


@router.post("/resource/{entity}/{id:int}/revise")
def revise(entity: str, id: int, request: Request, admin: Admin, db: Db):
    authorize(admin, entity, "edit")
    flow.require_ready(db)
    content = flow.reflected(db, entity)
    record = flow.row(db, content, id, lock=True)
    field = flow.status_field(content)
    if record[field] != "in_review" or not can_revise_entity(entity):
        raise HTTPException(409, "This record cannot be reopened for editing.")
    flow.supersede(db, entity, id)
    flow.update_state(db, content, id, **{field: "draft"}, **flow.review_fields(entity, None, None, None))
    record_admin_audit(db, admin_id=admin.id, action="clinical_review.reopened", entity=entity, entity_id=id, request=request)
    db.commit()
    return {"status": "draft"}


@router.post("/resource/{entity}/{id:int}/re-review")
def rereview(entity: str, id: int, request: Request, admin: Admin, db: Db):
    authorize(admin, entity, "edit")
    flow.require_ready(db)
    content = flow.reflected(db, entity)
    record = flow.row(db, content, id, lock=True)
    previous = flow.last_publication(db, entity, record)
    if not flow.is_live(entity, record) or not previous or previous["entity_id"] != id:
        raise HTTPException(409, "Only the current published revision can be submitted for re-review.")
    table = flow.reflected(db, "content_reviews")
    latest = db.execute(select(table).where(table.c.entity == entity, table.c.entity_id == id,
                        table.c.superseded_at.is_(None)).order_by(table.c.id.desc()).limit(1)).mappings().first()
    if latest and latest["id"] != previous["review_id"] and latest["decision"] in {"pending", "approved"}:
        raise HTTPException(409, "A re-review is already in progress.")
    flow.submit(db, entity, id, admin.id)
    record_admin_audit(db, admin_id=admin.id, action="clinical_review.resubmitted", entity=entity, entity_id=id, request=request)
    db.commit()
    return {"status": "pending"}
