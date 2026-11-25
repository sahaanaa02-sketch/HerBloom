import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import E2E_MODE
from app.database import get_db
from app.dependencies.admin_auth import get_current_admin, get_admin_permissions, require_admin_permission
from app.models.admin import AdminUser
from app.models.user import User
from app.services import entitlements
from app.services import mother_account as mail
from app.services import user_privacy as privacy
from app.services.admin_audit import record_admin_audit

router = APIRouter(prefix="/api/admin", tags=["Users and Data Requests"])
Db = Annotated[Session, Depends(get_db)]
Viewer = Annotated[AdminUser, Depends(require_admin_permission("users.view"))]
Manager = Annotated[AdminUser, Depends(require_admin_permission("users.manage"))]
Admin = Annotated[AdminUser, Depends(get_current_admin)]
log = logging.getLogger(__name__)

REQUEST_FIELDS = "id,user_id,type,status,requested_by,confirmed_by,created_at,done_at,expires_at"
ACCOUNT_ACTION = Literal["deactivate","reactivate","send-reset","resend-verification"]


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class NewRequest(Payload):
    user_id: int = Field(ge=1, le=2147483647, strict=True)
    type: Literal["export","delete"]


class Ticket(Payload):
    token: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")


def confirmer(admin):
    return "data_requests.confirm" in get_admin_permissions(admin) and any(r.name == "super_admin" for r in admin.roles)


def require_confirmer(admin):
    if not confirmer(admin):
        raise HTTPException(403, "Super administrator confirmation is required.")


def require_request_access(admin):
    if not confirmer(admin) and "users.manage" not in get_admin_permissions(admin):
        raise HTTPException(403, "Data request access is required.")


def audit(db, request, admin, action, uid, request_id=None):
    record_admin_audit(db, admin_id=admin.id, action=action, entity="users", entity_id=uid,
                       after={"request_id":request_id} if request_id is not None else None, request=request)


def rate(db, key, cap=20, minutes=60):
    if not privacy.consume_limit(db, key, cap, minutes):
        raise HTTPException(429, "Too many requests. Try again later.")


def request_record(db, id, locked=False):
    suffix = " FOR UPDATE" if locked else ""
    row = privacy.rows(db, "SELECT * FROM data_requests WHERE id=%s" + suffix, (id,))
    if not row:
        raise HTTPException(404, "Data request not found.")
    return row[0]


def safe_record(row, admin):
    values = {k: row[k] for k in REQUEST_FIELDS.split(",")}
    values["can_download"] = bool(privacy.exports_enabled() and confirmer(admin) and row["confirmed_by"] == admin.id and row["type"] == "export"
                                  and row["status"] == "done" and row["file_path"] and row["expires_at"]
                                  and row["expires_at"] > privacy.now())
    return values


def include_current_plans(db, items):
    visible_ids = [item["id"] for item in items if item["status"] != "anonymized"]
    if not visible_ids:
        return
    users_table = User.__table__
    plan = entitlements.current_plan_expression(db, users_table, datetime.now(UTC))
    if plan is None:
        return
    plans = dict(db.execute(select(users_table.c.id, plan).where(
        users_table.c.id.in_(visible_ids), users_table.c.role == "MOTHER"
    )).all())
    for item in items:
        item["plan_name"] = plans.get(item["id"])


@router.get("/users")
def users(admin: Viewer, db: Db, q: str = Query("", max_length=150), page: int = Query(1, ge=1),
          page_size: int = Query(10, ge=1, le=100), status: Literal["active","inactive","anonymized"] | None = None,
          language: Literal["en","ta"] | None = None):
    privacy.readiness(db)
    filters = []
    params = []
    if q.strip():
        term = "%" + q.strip() + "%"
        filters.append("(display_name LIKE %s OR email LIKE %s)")
        params.extend((term, term))
    for field,value in (("status",status),("language",language)):
        if value:
            filters.append(field+"=%s")
            params.append(value)
    where = " WHERE " + " AND ".join(filters) if filters else ""
    count = privacy.sql(db, "SELECT COUNT(*) FROM v_admin_users"+where, tuple(params)).scalar_one()
    items = privacy.rows(db, "SELECT * FROM v_admin_users"+where+" ORDER BY id DESC LIMIT %s OFFSET %s",
                         (*params,page_size,(page-1)*page_size))
    include_current_plans(db, items)
    return {"items": items, "total": count,
            "account_email_enabled": mail.outbound_email_enabled() and "users.manage" in get_admin_permissions(admin)}


@router.get("/users/{id:int}")
def detail(id: int, admin: Viewer, db: Db):
    privacy.readiness(db)
    values = privacy.rows(db, "SELECT * FROM v_admin_users WHERE id=%s",(id,))
    if not values:
        raise HTTPException(404, "Mother account not found.")
    history = privacy.rows(db, "SELECT l.id,l.action,l.created_at,a.name AS admin_name FROM audit_log l "
                           "LEFT JOIN admin_users a ON a.id=l.admin_id WHERE l.entity='users' AND l.entity_id=%s "
                           "ORDER BY l.id DESC LIMIT 100",(str(id),))
    include_current_plans(db, values)
    return {**values[0],"history":history}


@router.post("/users/{id:int}/{action}")
def account_action(id: int, action: ACCOUNT_ACTION, request: Request, admin: Manager, db: Db):
    privacy.readiness(db)
    sends_email = action in ("send-reset", "resend-verification")
    if sends_email:
        mail.require_outbound_email()
    rate(db, f"user-action:{admin.id}")
    if sends_email:
        rate(db, f"account-mail:{id}", 3)
    account = privacy.account_lock(db,id)
    if account["anonymized_at"]:
        raise HTTPException(409,"An anonymized account cannot receive account actions.")
    if action in ("deactivate","reactivate"):
        active = action == "reactivate"
        if bool(account["is_active"]) == active:
            raise HTTPException(409,"The account already has that status.")
        privacy.sql(db,"UPDATE users SET is_active=%s,session_version=session_version+1 WHERE id=%s",(active,id))
        privacy.sql(db,"UPDATE mother_account_tokens SET used_at=%s WHERE user_id=%s AND used_at IS NULL",(privacy.now(),id))
        audit(db,request,admin,"users."+action,id)
        db.commit()
    else:
        purpose = "password_reset" if action == "send-reset" else "verify_email"
        raw, token_id = mail.issue_token(db,account,purpose)
        audit(db,request,admin,"users."+action+".requested",id)
        db.commit()
        try:
            mail.send_account_email(account["email"],purpose,raw)
        except Exception:
            mail.invalidate_delivery(db, token_id)
            audit(db,request,admin,"users."+action+".delivery_failed",id)
            db.commit()
            raise HTTPException(503,"Account email could not be delivered.") from None
        audit(db,request,admin,"users."+action+".sent",id)
        db.commit()
    return {"message":"Account action completed."}


@router.get("/data-requests")
def list_requests(admin: Admin, db: Db, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
                  status: Literal["requested","confirmed","done","rejected"] | None = None,
                  type: Literal["export","delete"] | None = None):
    require_request_access(admin)
    privacy.readiness(db)
    expected = {"status":status,"type":type}
    pred = " AND ".join(k+"=%s" for k,v in expected.items() if v)
    args = tuple(v for v in expected.values() if v)
    where = " WHERE "+pred if pred else ""
    count = privacy.sql(db,"SELECT COUNT(*) FROM data_requests"+where,args).scalar_one()
    values = privacy.rows(db,"SELECT * FROM data_requests"+where+" ORDER BY id DESC LIMIT %s OFFSET %s",(*args,page_size,(page-1)*page_size))
    return {"items":[safe_record(r,admin) for r in values],"total":count}


@router.get("/data-requests/{id:int}")
def data_request(id: int, admin: Admin, db: Db):
    require_request_access(admin)
    privacy.readiness(db)
    row = request_record(db,id)
    can_confirm = confirmer(admin)
    return {**safe_record(row, admin), "can_confirm": can_confirm,
            "export_confirmation_enabled": can_confirm and privacy.exports_enabled()}


@router.post("/data-requests", status_code=201)
def create_request(body: NewRequest, request: Request, admin: Manager, db: Db):
    privacy.readiness(db)
    rate(db,f"request-init:{admin.id}")
    account = privacy.account_lock(db,body.user_id)
    if account["anonymized_at"]:
        raise HTTPException(409,"This account is anonymized.")
    existing = privacy.sql(db,"SELECT id FROM data_requests WHERE user_id=%s AND type=%s "
                           "AND status IN ('requested','confirmed') LIMIT 1",(body.user_id,body.type)).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409,"A request of this type is already pending.")
    id = privacy.sql(db,"INSERT INTO data_requests (user_id,type,requested_by) VALUES (%s,%s,%s)",
                     (body.user_id,body.type,admin.id)).lastrowid
    audit(db,request,admin,"data_request.requested",body.user_id,id)
    row = request_record(db,id)
    db.commit()
    return safe_record(row,admin)


@router.get("/data-requests/{id:int}/impact")
def impact(id: int, admin: Admin, db: Db):
    require_confirmer(admin)
    privacy.readiness(db)
    row = request_record(db,id)
    if row["type"] != "delete":
        raise HTTPException(409,"An impact report applies to deletion requests.")
    return privacy.deletion_impact(db,row["user_id"])


@router.post("/data-requests/{id:int}/confirm")
def confirm(id: int, request: Request, admin: Admin, db: Db):
    require_confirmer(admin)
    privacy.readiness(db)
    initial = request_record(db,id)
    if initial["type"] == "export":
        privacy.require_exports()
    rate(db,f"request-confirm:{admin.id}",10)
    account = privacy.account_lock(db,initial["user_id"])
    row = request_record(db,id,True)
    if row["status"] != "requested" or account["anonymized_at"]:
        raise HTTPException(409,"This request cannot be confirmed.")
    audit(db,request,admin,"data_request.confirmed",row["user_id"],id)
    privacy.sql(db,"UPDATE data_requests SET status='confirmed',confirmed_by=%s WHERE id=%s",(admin.id,id))
    if row["type"] == "export":
        name = None
        try:
            name = privacy.create_export(db,row["user_id"])
            stamp = privacy.now()
            privacy.sql(db,"UPDATE data_requests SET status='done',done_at=%s,file_path=%s,expires_at=%s WHERE id=%s",
                        (stamp,name,stamp+timedelta(hours=24),id))
            audit(db,request,admin,"data_request.export_generated",row["user_id"],id)
            db.commit()
        except Exception:
            db.rollback()
            if name:
                privacy.file_for(name).unlink(missing_ok=True)
            raise
    else:
        db.commit()
    return safe_record(request_record(db,id),admin)


@router.post("/data-requests/{id:int}/reject")
def reject(id: int, request: Request, admin: Admin, db: Db):
    require_confirmer(admin)
    privacy.readiness(db)
    rate(db,f"request-confirm:{admin.id}",10)
    row = request_record(db,id,True)
    if row["status"] not in ("requested","confirmed"):
        raise HTTPException(409,"This request cannot be rejected.")
    privacy.sql(db,"UPDATE data_requests SET status='rejected',done_at=%s WHERE id=%s",(privacy.now(),id))
    audit(db,request,admin,"data_request.rejected",row["user_id"],id)
    db.commit()
    return safe_record(request_record(db,id),admin)


@router.post("/data-requests/{id:int}/execute-test-deletion")
def test_deletion(id: int, request: Request, admin: Admin, db: Db):
    require_confirmer(admin)
    if not E2E_MODE:
        raise HTTPException(409,"Production deletion is pending separate authorization.")
    privacy.readiness(db)
    rate(db,f"test-deletion:{admin.id}",10)
    initial = request_record(db,id)
    account = privacy.account_lock(db,initial["user_id"])
    row = request_record(db,id,True)
    if row["type"] != "delete" or row["status"] != "confirmed" or row["confirmed_by"] != admin.id or account["anonymized_at"]:
        raise HTTPException(409,"A confirmed synthetic deletion request is required.")
    files = privacy.execute_test_deletion(db,account)
    privacy.sql(db,"UPDATE data_requests SET status='done',done_at=%s WHERE id=%s",(privacy.now(),id))
    audit(db,request,admin,"data_request.synthetic_deletion_done",row["user_id"],id)
    db.commit()
    for path in files:
        path.unlink(missing_ok=True)
    return safe_record(request_record(db,id),admin)


def download_record(db,id,admin):
    privacy.require_exports()
    row = request_record(db,id,True)
    if not safe_record(row,admin)["can_download"]:
        raise HTTPException(404,"An active export is unavailable.")
    path = privacy.file_for(row["file_path"])
    if not path.is_file():
        raise HTTPException(404,"An active export is unavailable.")
    return row,path


@router.post("/data-requests/{id:int}/download-ticket")
def download_ticket(id: int, request: Request, admin: Admin, db: Db):
    require_confirmer(admin)
    privacy.readiness(db)
    privacy.require_exports()
    rate(db,f"export-ticket:{admin.id}",10)
    row,_ = download_record(db,id,admin)
    raw=secrets.token_urlsafe(32)
    privacy.sql(db,"UPDATE data_requests SET download_hash=%s WHERE id=%s",(privacy.secret_hash(raw),id))
    audit(db,request,admin,"data_request.download_ticket",row["user_id"],id)
    db.commit()
    from fastapi.responses import JSONResponse
    return JSONResponse({"token":raw,"expires_at":row["expires_at"].isoformat()},headers={"Cache-Control":"no-store"})


@router.post("/data-requests/{id:int}/download")
def download(id: int, body: Ticket, request: Request, admin: Admin, db: Db):
    require_confirmer(admin)
    privacy.readiness(db)
    privacy.require_exports()
    rate(db,f"export-download:{admin.id}",20)
    row,path = download_record(db,id,admin)
    if not row["download_hash"] or not secrets.compare_digest(row["download_hash"],privacy.secret_hash(body.token)):
        raise HTTPException(404,"An active export is unavailable.")
    privacy.sql(db,"UPDATE data_requests SET download_hash=NULL WHERE id=%s",(id,))
    audit(db,request,admin,"data_request.downloaded",row["user_id"],id)
    db.commit()
    return FileResponse(path,media_type="application/zip",filename="herbloom-data-export.zip",
                        headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"})
