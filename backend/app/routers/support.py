"""In-app support and bilingual FAQs. This module has no outbound transport."""
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import get_admin_permissions, require_admin_permission
from app.models.admin import AdminUser
from app.models.user import User
from app.routers.auth import require_mother
from app.services.analytics import ready
from app.services.admin_overview import database_clock
from app.services.admin_audit import record_admin_audit

router = APIRouter(tags=["Support and FAQs"])
admin_router = APIRouter(prefix="/api/admin/support", tags=["Admin support"])
Db = Annotated[Session, Depends(get_db)]
Mother = Annotated[User, Depends(require_mother)]
Viewer = Annotated[AdminUser, Depends(require_admin_permission("support.view"))]
Replier = Annotated[AdminUser, Depends(require_admin_permission("support.reply"))]
Manager = Annotated[AdminUser, Depends(require_admin_permission("support.manage"))]
Category = Literal["account","technical","billing","feedback","other"]
Status = Literal["open","pending","closed"]
Lang = Literal["en","ta"]
Body = Annotated[str, StringConstraints(strip_whitespace=True,min_length=1,max_length=4000)]
Search = Annotated[str, Query(max_length=120)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Ticket(Input):
    subject: Annotated[str, StringConstraints(strip_whitespace=True,min_length=1,max_length=160)]
    message: Body
    category: Category


class Reply(Input):
    body: Body


class TicketUpdate(Input):
    status: Status
    assignee_admin_id: Annotated[int,Field(gt=0)] | None = None


class FAQ(Input):
    question_en: Annotated[str,StringConstraints(strip_whitespace=True,min_length=1,max_length=240)]
    question_ta: Annotated[str,StringConstraints(strip_whitespace=True,min_length=1,max_length=240)]
    answer_en: Body
    answer_ta: Body
    category: Annotated[str,StringConstraints(strip_whitespace=True,min_length=1,max_length=60)]
    sort_order: Annotated[int,Field(ge=0,le=100000)] = 0


class Publication(Input):
    published: bool


def sql(db, statement, values=()):
    return db.connection().exec_driver_sql(statement, values)


def require_storage(db):
    if not ready(db):
        raise HTTPException(503,"Support is awaiting its database migration.")


def now():
    return datetime.now(UTC).replace(tzinfo=None)


def serialize(row, clock=UTC):
    return {k: v.replace(tzinfo=clock).astimezone(UTC) if isinstance(v,datetime) else v for k,v in row.items()}


def fetch_ticket(db, id, owner=None, lock=False):
    require_storage(db)
    query = "SELECT * FROM support_tickets WHERE id=%s"
    args = (id,)
    if owner is not None:
        query += " AND user_id=%s"
        args += (owner,)
    if lock:
        query += " FOR UPDATE"
    row = sql(db,query,args).mappings().one_or_none()
    if row is None:
        raise HTTPException(404,"Ticket not found.")
    return row


def select_page(db, table, columns, clauses, args, before):
    if before is not None:
        clauses.append("id<%s")
        args.append(before)
    filters = " AND ".join(clauses)
    rows = sql(db,f"SELECT {columns} FROM {table} WHERE {filters} ORDER BY id DESC LIMIT 21",
               tuple(args)).mappings().all()
    return {"items":[serialize(r) for r in rows[:20]],"next_before":rows[19]["id"] if len(rows)>20 else None}


def search_terms(search):
    return "%" + search.strip().replace("!","!!").replace("%","!%").replace("_","!_") + "%"


def thread(db, ticket, admin=False):
    public = {k:v for k,v in ticket.items() if k not in {"user_id","assignee_admin_id"}}
    replies_select = "id,body,created_at,admin_id" if admin else "id,body,created_at"
    replies = sql(db,f"SELECT {replies_select} FROM ticket_replies WHERE ticket_id=%s ORDER BY id",
                  (ticket["id"],)).mappings()
    result = {**serialize(ticket if admin else public), "replies":[serialize(row) for row in replies]}
    if admin:
        audit = sql(db,"SELECT action,admin_id,created_at,before_json,after_json FROM audit_log "
                    "WHERE entity='support_ticket' AND entity_id=%s ORDER BY id",(str(ticket["id"]),)).mappings()
        clock=database_clock(db)
        result["admin_history"] = [serialize(row, clock) for row in audit]
    else:
        changes = sql(db, "SELECT created_at, JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.status')) AS status "
                      "FROM audit_log WHERE entity='support_ticket' AND entity_id=%s "
                      "AND action='support.ticket_updated' AND JSON_UNQUOTE(JSON_EXTRACT(before_json,'$.status')) "
                      "<> JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.status')) ORDER BY id", (str(ticket["id"]),))
        result["status_history"] = [{"status":"open","created_at":serialize(public)["created_at"]}]
        clock=database_clock(db)
        result["status_history"].extend(serialize(row, clock) for row in changes.mappings())
    return result


@router.get("/api/support/tickets")
def my_tickets(user: Mother, db: Db, before: int | None = Query(None,ge=1)):
    require_storage(db)
    return select_page(db,"support_tickets","id,subject,category,status,created_at,updated_at",
                       ["user_id=%s"],[user.id],before)


@router.post("/api/support/tickets",status_code=201)
def create_ticket(body: Ticket, user: Mother, db: Db):
    require_storage(db)
    stamp = now()
    result = sql(db,"INSERT INTO support_tickets (user_id,subject,message,category,created_at,updated_at) "
                 "VALUES (%s,%s,%s,%s,%s,%s)",
                 (user.id,body.subject,body.message,body.category,stamp,stamp))
    id = result.lastrowid
    ticket = thread(db,fetch_ticket(db,id,user.id))
    db.commit()
    return ticket


@router.get("/api/support/tickets/{id}")
def my_ticket(id: int, user: Mother, db: Db):
    return thread(db,fetch_ticket(db,id,user.id))


@admin_router.get("/tickets")
def inbox(admin: Viewer, db: Db, search: Search="", category: Category | None=None,
          status: Status | None=None, assignee: int | None=Query(None,ge=1), before: int | None=Query(None,ge=1)):
    require_storage(db)
    clauses,args=["1=1"],[]
    for key,value in (("category",category),("status",status),("assignee_admin_id",assignee)):
        if value is not None:
            clauses.append(key+"=%s")
            args.append(value)
    if search.strip():
        clauses.append("subject LIKE %s ESCAPE '!'")
        args.append(search_terms(search))
    return select_page(db,"support_tickets",
                       "id,subject,category,status,assignee_admin_id,created_at,updated_at,"
                       "(SELECT name FROM admin_users WHERE id=support_tickets.assignee_admin_id) AS assignee_name",
                       clauses,args,before)


@admin_router.get("/tickets/{id}")
def detail(id: int, admin: Viewer, db: Db):
    return thread(db,fetch_ticket(db,id),admin=True)


@admin_router.get("/assignees")
def assignees(admin: Manager, db: Db):
    return [{"id":a.id,"name":a.name} for a in db.scalars(select(AdminUser).where(AdminUser.active.is_(True)))
            if "support.view" in get_admin_permissions(a)]


@admin_router.post("/tickets/{id}/replies",status_code=201)
def reply(id: int, body: Reply, request: Request, admin: Replier, db: Db):
    ticket=fetch_ticket(db,id,lock=True)
    if ticket["status"]=="closed":
        raise HTTPException(409,"Reopen the ticket before replying.")
    stamp=now()
    result=sql(db,"INSERT INTO ticket_replies (ticket_id,admin_id,body,created_at) VALUES (%s,%s,%s,%s)",
               (id,admin.id,body.body,stamp))
    sql(db,"UPDATE support_tickets SET updated_at=%s WHERE id=%s",(stamp,id))
    record_admin_audit(db,admin_id=admin.id,action="support.reply_added",entity="support_ticket",
                       entity_id=id,request=request,after={"reply_id":result.lastrowid})
    db.commit()
    return {"id":result.lastrowid}


@admin_router.patch("/tickets/{id}")
def update(id: int, body: TicketUpdate, request: Request, admin: Manager, db: Db):
    ticket=fetch_ticket(db,id,lock=True)
    before={key:ticket[key] for key in ("status","assignee_admin_id")}
    after=before | body.model_dump(exclude_unset=True)
    if after==before:
        return after
    assignee=after["assignee_admin_id"]
    if assignee is not None and assignee!=before["assignee_admin_id"]:
        staff=db.get(AdminUser,assignee)
        if not staff or not staff.active or "support.view" not in get_admin_permissions(staff):
            raise HTTPException(422,"Select an active support administrator.")
    sql(db,"UPDATE support_tickets SET status=%s,assignee_admin_id=%s,updated_at=%s WHERE id=%s",
        (after["status"],assignee,now(),id))
    record_admin_audit(db,admin_id=admin.id,action="support.ticket_updated",entity="support_ticket",
                       entity_id=id,request=request,before=before,after=after)
    db.commit()
    return after


@router.get("/api/faqs")
def published_faqs(db: Db, language: Lang="en"):
    if not ready(db):
        return {"available":False,"items":[]}
    return {"available":True,"items":[dict(row) for row in sql(db,
        f"SELECT id,question_{language} AS question,answer_{language} AS answer,category "
        "FROM faqs WHERE status='published' ORDER BY sort_order,id").mappings()]}


@admin_router.get("/faqs")
def list_faqs(admin: Viewer, db: Db, search: Search="", status: Literal["draft","published"] | None=None,
              category: Annotated[str | None, Query(max_length=60)]=None,
              before: int | None=Query(None,ge=1)):
    require_storage(db)
    clauses,args=["1=1"],[]
    if status is not None:
        clauses.append("status=%s")
        args.append(status)
    if category:
        clauses.append("category=%s")
        args.append(category)
    if search.strip():
        clauses.append("(question_en LIKE %s ESCAPE '!' OR question_ta LIKE %s ESCAPE '!')")
        args.extend([search_terms(search)]*2)
    return select_page(db,"faqs","*",clauses,args,before)


def faq_row(db,id):
    row=sql(db,"SELECT * FROM faqs WHERE id=%s FOR UPDATE",(id,)).mappings().one_or_none()
    if row is None:
        raise HTTPException(404,"FAQ not found.")
    return dict(row)


def save_faq(db,admin,request,body,id=None):
    require_storage(db)
    fields=("question_en","question_ta","answer_en","answer_ta","category","sort_order")
    values=tuple(getattr(body,k) for k in fields)
    if id is None:
        id=sql(db,"INSERT INTO faqs ("+",".join(fields)+") VALUES (%s,%s,%s,%s,%s,%s)",values).lastrowid
        before=None
    else:
        before=faq_row(db,id)
        sql(db,"UPDATE faqs SET "+",".join(k+"=%s" for k in fields)+" WHERE id=%s",values+(id,))
    row=faq_row(db,id)
    record_admin_audit(db,admin_id=admin.id,action="faq.created" if before is None else "faq.updated",
                       entity="faq",entity_id=id,request=request,before=before,after=row)
    db.commit()
    return row


@admin_router.post("/faqs",status_code=201)
def create_faq(body: FAQ, request: Request, admin: Manager, db: Db):
    return save_faq(db,admin,request,body)


@admin_router.put("/faqs/{id}")
def edit_faq(id: int, body: FAQ, request: Request, admin: Manager, db: Db):
    return save_faq(db,admin,request,body,id)


@admin_router.post("/faqs/{id}/publication")
def publish_faq(id: int, body: Publication, request: Request, admin: Manager, db: Db):
    require_storage(db)
    before=faq_row(db,id)["status"]
    after="published" if body.published else "draft"
    if before!=after:
        sql(db,"UPDATE faqs SET status=%s WHERE id=%s",(after,id))
        record_admin_audit(db,admin_id=admin.id,action="faq.publication_changed",entity="faq",entity_id=id,
                           request=request,before={"status":before},after={"status":after})
        db.commit()
    return {"id":id,"status":after}
