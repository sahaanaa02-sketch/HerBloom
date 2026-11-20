from app.services import clinical_review as clinical
from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, inspect, select, column
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import require_admin_permission
from app.models.chat import SafetyEvent
from app.services.admin_audit import record_admin_audit
from app.services.chat_safety import check_text
from app.services.recovery_rules import local_today
from app.services.safety_content import RESOURCES, latest_messages, published_rows, safety_table
from app.routers.chat import require_mother

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Reader = Annotated[object, Depends(require_admin_permission("safety.view"))]
Editor = Annotated[object, Depends(require_admin_permission("safety.edit"))]
Mother = Annotated[object, Depends(require_mother)]
Resource = Literal["warning-signs", "red-flag-terms", "messages", "helplines"]


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Warning(Payload):
    audience: Literal["mother", "baby"]
    text_en: str = Field(min_length=1, max_length=4000)
    text_ta: str = Field(min_length=1, max_length=4000)
    sort_order: int = Field(ge=0, le=9999)


class Term(Payload):
    term: str = Field(min_length=1, max_length=160)
    lang: Literal["en", "ta"]
    category: Literal["urgent", "crisis"]
    active: bool


class Message(Payload):
    message_key: Literal["urgent_card", "crisis_card", "no_info"]
    body_en: str = Field(min_length=1, max_length=4000)
    body_ta: str = Field(min_length=1, max_length=4000)


class Helpline(Payload):
    name_en: str = Field(min_length=1, max_length=160)
    name_ta: str = Field(min_length=1, max_length=160)
    number: str = Field(max_length=32, pattern=r"^\+?[0-9][0-9 ()-]*[0-9]$")
    description_en: str = Field(min_length=1, max_length=2000)
    description_ta: str = Field(min_length=1, max_length=2000)
    sort_order: int = Field(ge=0, le=9999)
    active: bool


class Tester(Payload):
    text: str = Field(min_length=1, max_length=4000)
    lang: Literal["en", "ta"]


SCHEMAS = {"warning-signs": Warning, "red-flag-terms": Term, "messages": Message, "helplines": Helpline}


def get_resource(db, resource):
    resource_table = safety_table(db, RESOURCES[resource])
    if resource_table is None:
        raise HTTPException(503, "Safety management is awaiting its database migration.")
    return resource_table


def load(db, resource_table, id, lock=False):
    stmt = select(resource_table).where(resource_table.c.id == id)
    if lock:
        stmt = stmt.with_for_update()
    row = db.execute(stmt).mappings().one_or_none()
    if row is None:
        raise HTTPException(404, "Safety record not found.")
    return dict(row)


def audit_value(row):
    return {k: v.isoformat() if hasattr(v, "isoformat") else v for k, v in row.items()}


@router.post("/api/admin/safety/test")
def test_match(body: Tester, admin: Reader, db: Db):
    # No persistence or logging of the input. Test the effective matcher, including fallback rules.
    result = check_text(body.text, body.lang, db=db, include_match=True)
    return {"result": result["type"] if result else "none",
            "matched_term": result["matched_term"] if result else None}


@router.get("/api/admin/safety/events")
def events(admin: Reader, db: Db):
    event = SafetyEvent.__table__
    source = (func.coalesce(column("source"), "legacy")
              if "source" in {c["name"] for c in inspect(db.connection()).get_columns("safety_events")}
              else func.coalesce(None, "legacy"))
    week = local_today()
    week -= timedelta(days=week.weekday())
    first = week - timedelta(weeks=7)
    end = week + timedelta(days=7)
    day = func.date(event.c.created_at)
    rows = db.execute(select(day, event.c.category, source, func.count())
                      .where(event.c.created_at >= first, event.c.created_at < end)
                      .group_by(day, event.c.category, source))
    counts = {}
    for day_value, category, origin, count in rows:
        monday = day_value - timedelta(days=day_value.weekday())
        key = (monday.isoformat(), category, origin)
        counts[key] = counts.get(key, 0) + count
    return [{"week": k[0], "category": k[1], "source": k[2], "count": v}
            for k, v in sorted(counts.items())]


@router.get("/api/admin/safety/{resource}")
def listing(resource: Resource, admin: Reader, db: Db, page: int = Query(1, ge=1),
            page_size: int = Query(10, ge=1, le=100)):
    content = get_resource(db, resource)
    ordering = [content.c.sort_order] if "sort_order" in content.c else []
    rows = db.execute(select(content).order_by(*ordering, content.c.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).mappings()
    return {"items": [dict(r) for r in rows], "total": db.scalar(select(func.count()).select_from(content))}


def save(resource, values, request, admin, db, id=None):
    if not isinstance(values, SCHEMAS[resource]):
        raise HTTPException(422, "The fields do not match this safety resource.")
    content = get_resource(db, resource)
    before = load(db, content, id, lock=True) if id is not None else None
    if before is not None and before["status"] != "in_review":
        raise HTTPException(409, "Only content awaiting review can be edited here.")
    values = values.model_dump()
    if resource == "messages":
        if before is not None and before["message_key"] != values["message_key"]:
            raise HTTPException(422, "A message version's key cannot be changed.")
        values["version"] = (before["version"] if before is not None else 1 + (
            db.scalar(select(func.max(content.c.version)).where(content.c.message_key == values["message_key"])) or 0
        ))
    values.update(status="in_review", updated_by=admin.id, reviewed_by=None, reviewed_at=None)
    try:
        if before is None:
            id = db.execute(content.insert().values(**values, created_by=admin.id)).inserted_primary_key[0]
        else:
            db.execute(content.update().where(content.c.id == id).values(**values))
        after = load(db, content, id)
        record_admin_audit(db, admin_id=admin.id, action=content.name + (".updated" if before else ".created"),
                           entity=content.name, entity_id=id, request=request,
                           before=audit_value(before) if before else None, after=audit_value(after))
        clinical.submit(db, content.name, id, admin.id)
        db.commit()
        return after
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This safety record conflicts with an existing entry. Refresh before retrying.") from None


SafetyPayload = Warning | Term | Message | Helpline


@router.post("/api/admin/safety/{resource}", status_code=201)
def create(resource: Resource, body: SafetyPayload, request: Request, admin: Editor, db: Db):
    return save(resource, body, request, admin, db)


@router.put("/api/admin/safety/{resource}/{id}")
def update(resource: Resource, id: int, body: SafetyPayload, request: Request, admin: Editor, db: Db):
    return save(resource, body, request, admin, db, id)


@router.delete("/api/admin/safety/{resource}/{id}")
def archive(resource: Resource, id: int, request: Request, admin: Editor, db: Db):
    content = get_resource(db, resource)
    before = load(db, content, id, lock=True)
    if before["status"] != "in_review":
        raise HTTPException(409, "Only content awaiting review can be archived here.")
    db.execute(content.update().where(content.c.id == id).values(status="archived", updated_by=admin.id))
    after = load(db, content, id)
    record_admin_audit(db, admin_id=admin.id, action=content.name + ".archived", entity=content.name,
                       entity_id=id, request=request, before=audit_value(before), after=audit_value(after))
    clinical.supersede(db, content.name, id)
    db.commit()
    return after


@router.get("/safety/warning-signs")
def warnings(db: Db, mother: Mother, response: Response):
    response.headers["Cache-Control"] = "private, max-age=600"
    response.headers["Vary"] = "Authorization"
    return [{k: row[k] for k in ("audience", "text_en", "text_ta")}
            for row in published_rows(db, "warning_signs", "sort_order")]


@router.get("/safety/helplines")
def helplines(db: Db, mother: Mother, response: Response):
    response.headers["Cache-Control"] = "private, max-age=600"
    response.headers["Vary"] = "Authorization"
    return [{k: row[k] for k in ("name_en", "name_ta", "number", "description_en", "description_ta")}
            for row in published_rows(db, "helplines", "sort_order")]


@router.get("/safety/messages")
def messages(db: Db, mother: Mother, response: Response):
    response.headers["Cache-Control"] = "private, max-age=600"
    response.headers["Vary"] = "Authorization"
    return [{k: row[k] for k in ("message_key", "body_en", "body_ta", "version")}
            for row in latest_messages(db).values()]
