import csv
import io
import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies.admin_auth import get_admin_permissions, require_admin_permission
from app.models.admin import AdminRole, AdminUser, AuditLog, admin_user_roles
from app.services import admin_invitation, app_settings, user_privacy
from app.services.admin_audit import record_admin_audit
from app.services.admin_overview import AUDIT_ACTION_LABELS, AUDIT_RESOURCE_LABELS
from app.services.admin_security import password_hasher

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Manager = Annotated[AdminUser, Depends(require_admin_permission("settings.manage"))]
Viewer = Annotated[AdminUser, Depends(require_admin_permission("settings.view"))]
Auditor = Annotated[AdminUser, Depends(require_admin_permission("audit.view"))]
LegalType = Literal["privacy", "terms", "refund", "disclaimer"]
RoleId = Annotated[int, Field(strict=True, ge=1, le=2147483647)]


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Roles(Payload):
    role_ids: list[RoleId] = Field(min_length=1, max_length=20)


class Invite(Roles):
    email: EmailStr
    name: str = Field(min_length=2, max_length=150)


class AcceptInvite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")
    password: str = Field(min_length=12, max_length=128)


class LegalDraft(Payload):
    type: LegalType
    body_en: str = Field(min_length=1, max_length=30000)
    body_ta: str = Field(min_length=1, max_length=30000)


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def audit(db, actor, request, entity, id, action, before=None, after=None):
    record_admin_audit(db, admin_id=actor, entity=entity, entity_id=id, action=action,
                       before=before, after=after, request=request)


def enforce_rate(db, key, limit):
    if not user_privacy.consume_limit(db, "a9:" + key, limit, 60):
        raise HTTPException(429, "Too many requests. Try again later.")


def is_super(admin):
    return any(role.name == "super_admin" for role in admin.roles)


def assigned_roles(db, ids, actor):
    roles = db.scalars(select(AdminRole).options(selectinload(AdminRole.permissions)).where(AdminRole.id.in_(ids))).all()
    if len(roles) != len(ids):
        raise HTTPException(422, "Select distinct, existing admin roles.")
    if not is_super(actor):
        available = set(get_admin_permissions(actor))
        if any(r.name == "super_admin" or not {p.key for p in r.permissions} <= available for r in roles):
            raise HTTPException(403, "You cannot grant these roles.")
    return roles


def lock_super_role(db):
    # Serializes decisions that could remove the last usable super administrator.
    db.scalar(select(AdminRole.id).where(AdminRole.name == "super_admin").with_for_update())


def locked_admin(db, id, actor):
    lock_super_role(db)
    account = db.scalar(select(AdminUser).where(AdminUser.id == id).with_for_update())
    if account is None:
        raise HTTPException(404, "Admin account not found.")
    if account.id == actor.id:
        raise HTTPException(409, "Ask another authorized administrator to change your account.")
    if is_super(account):
        if not is_super(actor):
            raise HTTPException(403, "Only a super administrator can change this account.")
        peers = (select(AdminUser.id).join(admin_user_roles).join(AdminRole)
                 .where(AdminUser.id != id, AdminUser.active.is_(True),
                        AdminRole.name == "super_admin").with_for_update())
        if account.active and not db.execute(peers).first():
            raise HTTPException(409, "The last active super administrator must remain available.")
    return account


def account_row(admin):
    return {"id": admin.id, "name": admin.name, "email": admin.email, "active": admin.active,
            "last_login_at": admin.last_login_at,
            "roles": [{"id": r.id, "name": r.name} for r in admin.roles]}


def revoke(db, id):
    user_privacy.sql(db, "UPDATE admin_users SET session_version=session_version+1 WHERE id=%s", (id,))


@router.get("/api/admin/settings/admins")
def admins(admin: Manager, db: Db, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100)):
    app_settings.require_ready(db)
    query = select(AdminUser).options(selectinload(AdminUser.roles)).order_by(AdminUser.id)
    data = db.scalars(query.offset((page-1)*page_size).limit(page_size)).all()
    return {"items": [account_row(a) for a in data], "total": db.scalar(select(func.count(AdminUser.id))),
            "invitation_delivery_enabled": admin_invitation.delivery_enabled(),
            "roles": [{"id": r.id, "name": r.name} for r in db.scalars(select(AdminRole).order_by(AdminRole.name))]}


@router.post("/api/admin/settings/admins/invite", status_code=201)
def invite(body: Invite, request: Request, admin: Manager, db: Db):
    app_settings.require_ready(db)
    admin_invitation.require_delivery()
    enforce_rate(db, f"invite:{admin.id}", 10)
    roles = assigned_roles(db, body.role_ids, admin)
    address = str(body.email).lower()
    raw = secrets.token_urlsafe(32)
    tokens = app_settings.table(db, "admin_invites")
    lock_super_role(db)
    account = db.scalar(select(AdminUser).where(AdminUser.email == address).with_for_update())
    stamp = now().replace(microsecond=0)
    try:
        if account is None:
            account = AdminUser(email=address, name=body.name, password_hash=password_hasher.hash(secrets.token_urlsafe(32)),
                                active=False, roles=roles)
            db.add(account)
            db.flush()
        else:
            used = db.scalar(select(tokens.c.id).where(tokens.c.admin_id == account.id,
                                                        tokens.c.used_at.is_not(None)).limit(1))
            pending = db.scalar(select(tokens.c.id).where(tokens.c.admin_id == account.id).limit(1))
            if account.active or used or not pending or (is_super(account) and not is_super(admin)):
                raise HTTPException(409, "An administrator already uses this email.")
            account.name, account.roles = body.name, roles
            db.execute(tokens.delete().where(tokens.c.admin_id == account.id, tokens.c.used_at.is_(None)))
        id = account.id
        db.execute(tokens.insert().values(admin_id=id, invited_by=admin.id, token_hash=user_privacy.secret_hash(raw),
                                          expires_at=stamp+timedelta(hours=48)))
        audit(db, admin.id, request, "admin_users", id, "admin.invite.created", after={"role_ids":body.role_ids})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An administrator already uses this email.") from None
    try:
        admin_invitation.send_invitation(address, raw)
    except Exception:
        db.execute(tokens.update().where(tokens.c.token_hash == user_privacy.secret_hash(raw)).values(expires_at=stamp))
        audit(db, admin.id, request, "admin_users", id, "admin.invite.delivery_failed")
        db.commit()
        raise HTTPException(503, "Admin invitation could not be delivered.") from None
    audit(db, admin.id, request, "admin_users", id, "admin.invite.sent")
    db.commit()
    return {"message":"Invitation sent."}


@router.post("/api/admin/auth/accept-invite")
def accept_invite(body: AcceptInvite, request: Request, db: Db):
    app_settings.require_ready(db)
    enforce_rate(db, "accept:"+ (request.client.host if request.client else "unknown"), 12)
    tokens = app_settings.table(db, "admin_invites")
    key = user_privacy.secret_hash(body.token)
    id = db.scalar(select(tokens.c.admin_id).where(tokens.c.token_hash == key))
    invalid = HTTPException(400, "This invitation is invalid or expired.")
    if id is None:
        raise invalid
    account = db.scalar(select(AdminUser).where(AdminUser.id == id).with_for_update())
    item = db.execute(select(tokens).where(tokens.c.token_hash == key).with_for_update()).mappings().one_or_none()
    stamp = now()
    if not item or item["used_at"] or item["expires_at"] <= stamp or account is None or account.active:
        raise invalid
    account.password_hash, account.active = password_hasher.hash(body.password), True
    revoke(db, id)
    db.execute(tokens.update().where(tokens.c.id == item["id"]).values(used_at=stamp))
    audit(db, id, request, "admin_users", id, "admin.invite.accepted")
    db.commit()
    return {"message":"Password set. Sign in to HerBloom."}


@router.put("/api/admin/settings/admins/{id:int}/roles")
def change_roles(id: int, body: Roles, request: Request, admin: Manager, db: Db):
    app_settings.require_ready(db)
    account = locked_admin(db, id, admin)
    roles = assigned_roles(db, body.role_ids, admin)
    before = {"role_ids":[r.id for r in account.roles]}
    account.roles = roles
    revoke(db,id)
    audit(db, admin.id, request, "admin_users", id, "admin.roles.updated", before, {"role_ids":body.role_ids})
    db.commit()
    return account_row(account)


@router.post("/api/admin/settings/admins/{id:int}/deactivate")
def account_action(id: int, request: Request, admin: Manager, db: Db):
    app_settings.require_ready(db)
    account = locked_admin(db,id,admin)
    if not account.active:
        raise HTTPException(409, "Only active admin accounts can receive this action.")
    before = {"active": account.active}
    account.active = False
    revoke(db,id)
    audit(db,admin.id,request,"admin_users",id,"admin.deactivate",before,{"active": False})
    db.commit()
    return account_row(account)


@router.get("/api/admin/settings")
def settings(admin: Viewer, db: Db):
    app_settings.require_ready(db)
    return app_settings.read_settings(db)


@router.put("/api/admin/settings")
def save_settings(body: app_settings.SiteSettings, request: Request, admin: Manager, db: Db):
    app_settings.require_ready(db)
    storage = app_settings.table(db,"app_settings")
    lock_super_role(db)
    before = app_settings.read_settings(db, lock=True).model_dump(mode="json")
    after = body.model_dump(mode="json")
    for key, value in sorted(after.items()):
        stmt=insert(storage).values(key=key,value_json=value,updated_by=admin.id)
        db.execute(stmt.on_duplicate_key_update(value_json=stmt.inserted.value_json,updated_by=admin.id))
    audit(db,admin.id,request,"app_settings",None,"settings.updated",before,after)
    db.commit()
    return body


@router.get("/api/public/settings")
def public_settings(db: Db):
    return app_settings.read_settings(db).model_dump(exclude={"stage2_enabled"})


LEGAL_FIELDS = ("id","type","version","body_en","body_ta","published_at")


def legal_public(record):
    return {k:record[k] for k in LEGAL_FIELDS}


@router.get("/api/public/legal")
def public_legal(db: Db):
    if not app_settings.ready(db):
        return []
    pages = app_settings.table(db,"legal_pages")
    latest = select(func.max(pages.c.version).label("version"),pages.c.type).where(
        pages.c.published_at.is_not(None)).group_by(pages.c.type).subquery()
    rows = db.execute(select(pages).join(latest, (pages.c.type==latest.c.type) &
                                      (pages.c.version==latest.c.version)).order_by(pages.c.type)).mappings()
    return [legal_public(r) for r in rows]


def load_legal(db, pages, id, lock=False):
    stmt = select(pages).where(pages.c.id==id)
    if lock:
        stmt = stmt.with_for_update()
    row = db.execute(stmt).mappings().one_or_none()
    if row is None:
        raise HTTPException(404, "Legal version not found.")
    return row


@router.get("/api/admin/settings/legal")
def legal_versions(admin: Viewer, db: Db, type: LegalType | None = None,
                   page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100)):
    app_settings.require_ready(db)
    pages=app_settings.table(db,"legal_pages")
    stmt=select(pages)
    if type:
        stmt=stmt.where(pages.c.type==type)
    total=db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows=db.execute(stmt.order_by(pages.c.type,pages.c.version.desc()).offset((page-1)*page_size).limit(page_size)).mappings()
    return {"items":[legal_public(r) for r in rows],"total":total}


@router.post("/api/admin/settings/legal",status_code=201)
def create_legal(body: LegalDraft, request: Request, admin: Manager, db: Db):
    app_settings.require_ready(db)
    pages=app_settings.table(db,"legal_pages")
    try:
        version=(db.scalar(select(func.max(pages.c.version)).where(pages.c.type==body.type)) or 0)+1
        id=db.execute(pages.insert().values(**body.model_dump(),version=version,
                      created_by=admin.id,updated_by=admin.id)).inserted_primary_key[0]
        audit(db,admin.id,request,"legal_pages",id,"legal.created",after={"type":body.type,"version":version})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,"A version was created concurrently. Refresh and try again.") from None
    return legal_public(load_legal(db,pages,id))


@router.put("/api/admin/settings/legal/{id:int}")
def edit_legal(id: int, body: LegalDraft, request: Request, admin: Manager, db: Db):
    app_settings.require_ready(db)
    pages=app_settings.table(db,"legal_pages")
    row=load_legal(db,pages,id,True)
    if row["published_at"] or row["type"]!=body.type:
        raise HTTPException(409,"Published versions are immutable and draft types cannot change.")
    db.execute(pages.update().where(pages.c.id==id).values(**body.model_dump(),updated_by=admin.id))
    audit(db,admin.id,request,"legal_pages",id,"legal.updated",
          {"type":row["type"],"version":row["version"],"body_en":row["body_en"],"body_ta":row["body_ta"]},
          {**body.model_dump(),"version":row["version"]})
    db.commit()
    return legal_public(load_legal(db,pages,id))


@router.post("/api/admin/settings/legal/{id:int}/publish")
def publish_legal(id: int, request: Request, admin: Manager, db: Db):
    app_settings.require_ready(db)
    pages=app_settings.table(db,"legal_pages")
    doc=load_legal(db,pages,id)
    versions=db.execute(select(pages).where(pages.c.type==doc["type"]).order_by(pages.c.version).with_for_update()).mappings().all()
    doc=next(row for row in versions if row["id"]==id)
    if doc["published_at"] or any(row["published_at"] and row["version"]>doc["version"] for row in versions):
        raise HTTPException(409,"Only an unpublished version newer than the published version can be released.")
    stamp=now()
    db.execute(pages.update().where(pages.c.id==id).values(published_at=stamp,published_by=admin.id,updated_by=admin.id))
    audit(db,admin.id,request,"legal_pages",id,"legal.published",after={"type":doc["type"],"version":doc["version"]})
    db.commit()
    return legal_public(load_legal(db,pages,id))


AUDIT_ENTITIES = {*AUDIT_RESOURCE_LABELS, "app_settings", "legal_pages"}
AUDIT_SUFFIXES = {*AUDIT_ACTION_LABELS,"accepted","enabled","replay_blocked","deactivate","reset-2fa",
                  "download_ticket","synthetic_deletion_done","returned","resolved"}
SAFE_ENUMS = {
    "status":{"active","inactive","draft","in_review","approved","published","archived","confirmed","requested","done","rejected","new","reviewed","content_fixed"},
    "type":{"privacy","terms","refund","disclaimer","export","delete"},
    "decision":{"pending","approved","changes_requested"},
    "feature":{"scan","chat","summary","plan"},
}
SAFE_FIELDS = {*SAFE_ENUMS,"active","totp_enabled","stage2_enabled","version","review_id",
               "request_id","role_ids","enabled","max_output_tokens","daily_limit_free","daily_limit_premium","supported_languages","body_en","body_ta","support_email",
               "maintenance_banner_en","maintenance_banner_ta"}


def sanitize_snapshot(data):
    if not isinstance(data,dict):
        return {}
    output={}
    for key,value in data.items():
        if key not in SAFE_FIELDS:
            continue
        if (value is None or isinstance(value,bool) or type(value) is int
                or (isinstance(value,str) and value in SAFE_ENUMS.get(key,set()))
                or (key=="role_ids" and isinstance(value,list) and all(type(i) is int for i in value))
                or (key=="supported_languages" and isinstance(value,list) and all(i in ("en","ta") for i in value))):
            output[key]=value
        else:
            output[key]="[redacted]"
    return output


def safe_audit(log, name):
    entity=log.entity if log.entity in AUDIT_ENTITIES else "administration"
    parts=log.action.split(".")
    prefix=parts[0]
    action=log.action if prefix in AUDIT_ENTITIES|{"admin","settings","legal","clinical_review","data_request"} and len(parts)<=4 and all(
        p in AUDIT_SUFFIXES|{"login","2fa","invite","roles","send-reset","resend-verification"} for p in parts[1:]
    ) and parts[-1] in AUDIT_SUFFIXES else "administrative_action"
    return {"id":log.id,"admin_id":log.admin_id,"admin_name":name,"entity":entity,"action":action,"created_at":log.created_at}


def audit_filters(admin_id: int | None = Query(None, ge=1),
                  entity: str | None = Query(None,max_length=100),
                  action: str | None = Query(None,max_length=100),
                  from_date: date | None = None, to_date: date | None = None):
    if from_date and to_date and from_date>to_date:
        raise HTTPException(422,"Start date must be on or before the end date.")
    filters = [(getattr(AuditLog,key)==value) for key,value in (("admin_id",admin_id),("entity",entity),("action",action)) if value is not None]
    if from_date:
        filters.append(AuditLog.created_at>=datetime.combine(from_date,time.min))
    if to_date and to_date<date.max:
        filters.append(AuditLog.created_at<datetime.combine(to_date+timedelta(days=1),time.min))
    return filters


Filters=Annotated[list,Depends(audit_filters)]


def audit_query():
    return select(AuditLog,AdminUser.name).outerjoin(AdminUser,AuditLog.admin_id==AdminUser.id)


@router.get("/api/admin/settings/audit")
def audit_list(admin: Auditor, db: Db, filters: Filters, page: int = Query(1,ge=1),
               page_size: int = Query(10,ge=1,le=100)):
    stmt=audit_query().where(*filters).order_by(AuditLog.id.desc())
    logs=db.execute(stmt.offset((page-1)*page_size).limit(page_size))
    return {"items":[safe_audit(log,name) for log,name in logs],
            "total":db.scalar(select(func.count(AuditLog.id)).where(*filters))}


@router.get("/api/admin/settings/audit/{id:int}")
def audit_detail(id: int, admin: Auditor, db: Db):
    row=db.execute(audit_query().where(AuditLog.id==id)).one_or_none()
    if row is None:
        raise HTTPException(404,"Audit entry not found.")
    log,name=row
    before,after=log.before_json or {},log.after_json or {}
    if not isinstance(before,dict) or not isinstance(after,dict):
        before,after={},{}
    return {**safe_audit(log,name),"before":sanitize_snapshot(before),"after":sanitize_snapshot(after),
            "changed_fields":sorted(k for k in (set(before)|set(after))&SAFE_FIELDS if before.get(k)!=after.get(k))}


@router.get("/api/admin/settings/audit.csv")
def export_audit(request: Request, admin: Auditor, db: Db, filters: Filters):
    app_settings.require_ready(db)
    enforce_rate(db,f"audit-export:{admin.id}",10)
    rows=db.execute(audit_query().where(*filters).order_by(AuditLog.id.desc()).limit(5001))
    columns=("id","admin_id","admin_name","entity","action","created_at")
    content=io.StringIO()
    writer=csv.writer(content)
    writer.writerow(columns)
    count=0
    for log,name in rows:
        count+=1
        if count>5000:
            raise HTTPException(422,"Narrow the audit filters to export at most 5,000 entries.")
        data=safe_audit(log,name)
        values=[str(data[k]) if data[k] is not None else "" for k in columns]
        writer.writerow(["'"+v if v.lstrip().startswith(("=","+","-","@")) or v.startswith(("\t","\r","\n")) else v for v in values])
    audit(db,admin.id,request,"app_settings",None,"settings.audit.downloaded")
    db.commit()
    return PlainTextResponse(content.getvalue(),media_type="text/csv",headers={
        "Content-Disposition":'attachment; filename="herbloom-audit.csv"',"Cache-Control":"no-store"})
