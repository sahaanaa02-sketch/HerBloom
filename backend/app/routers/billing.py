"""PayHere Sandbox checkout and read-only payment monitoring."""
from datetime import UTC
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import get_admin_permissions, get_current_admin, require_admin_permission
from app.models.admin import AdminUser
from app.models.user import User
from app.routers.auth import require_mother
from app.services import billing, payhere
from app.services.admin_audit import record_admin_audit

router = APIRouter(prefix="/api/billing", tags=["Sandbox billing"])
admin_router = APIRouter(prefix="/api/admin/billing", tags=["Admin billing"])
Db = Annotated[Session, Depends(get_db)]
Mother = Annotated[User, Depends(require_mother)]
Manager = Annotated[AdminUser, Depends(require_admin_permission("billing.manage"))]
Status = Literal["pending","paid","failed","cancelled","refund_pending","refunded","chargeback"]


class Checkout(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan: Literal["premium"]


def require_view(admin: Annotated[AdminUser, Depends(get_current_admin)]):
    if not {"billing.view", "subscriptions.view"}.intersection(get_admin_permissions(admin)):
        raise HTTPException(403, "Billing access is unavailable.")
    return admin


Viewer = Annotated[AdminUser, Depends(require_view)]


@router.post("/checkout")
def checkout(body: Checkout, user: Mother, db: Db, idempotency_key: Annotated[str | None, Header()] = None):
    return billing.checkout(db, user.id, idempotency_key)


@router.get("/orders")
def orders(user: Mother, db: Db, before: int | None = Query(None, ge=1)):
    return billing.history(db, user.id, before)


@router.get("/orders/{reference}")
def order(reference: str, user: Mother, db: Db):
    return billing.public_order(billing.owner_order(db, reference, user.id))


@router.get("/receipts/{reference}")
def receipt(reference: str, user: Mother, db: Db):
    row = billing.owner_order(db, reference, user.id)
    if row.verified_at_utc is None:
        raise HTTPException(404, "Payment confirmation is unavailable.")
    return {**billing.public_order(row), "sandbox": True, "plan": "premium"}


@router.post("/payhere/notify")
async def notify(request: Request, db: Db):
    config = payhere.configuration()
    if request.headers.get("content-type", "").split(";", 1)[0].lower().strip() != "application/x-www-form-urlencoded":
        raise HTTPException(415, "Expected a PayHere form notification.")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > 8192:
            raise HTTPException(413, "Notification is too large.")
        body.extend(chunk)
    event = payhere.notification(config, body)
    accepted = billing.accept_event(db, config, event)
    if accepted:
        db.commit()
    return {"accepted": accepted}


@admin_router.get("/orders")
def admin_orders(admin: Viewer, db: Db, status: Status | None = None, review_only: bool = False,
                 before: int | None = Query(None, ge=1)):
    billing.require_storage(db)
    clauses, params = ["1=1"], []
    if before is not None:
        clauses.append("o.id<%s")
        params.append(before)
    if status is not None:
        clauses.append("o.status=%s")
        params.append(status)
    if review_only:
        clauses.append("o.review_required")
    rows = billing.sql(db, "SELECT o.*,e.starts_at_utc,e.ends_at_utc FROM billing_orders o "
                       "LEFT JOIN entitlement_periods e ON o.entitlement_id=e.id WHERE " +
                       " AND ".join(clauses) + " ORDER BY o.id DESC LIMIT 21", tuple(params)).mappings().all()
    return {"items": [dict(billing.public_order(row), starts_at=row.starts_at_utc.replace(tzinfo=UTC) if row.starts_at_utc else None,
                           expires_at=row.ends_at_utc.replace(tzinfo=UTC) if row.ends_at_utc else None)
                      for row in rows[:20]], "next_before": rows[19].id if len(rows) > 20 else None}


@admin_router.get("/orders/{reference}/events")
def events(reference: str, admin: Viewer, db: Db):
    billing.require_storage(db)
    row = billing.find(db, reference)
    if row is None:
        raise HTTPException(404, "Order not found.")
    records = billing.sql(db, "SELECT source,provider_status,provider_payment_id,received_at_utc FROM "
                          "billing_payment_events WHERE order_id=%s ORDER BY id DESC LIMIT 100", (row.id,)).mappings()
    return [dict(record, received_at_utc=record.received_at_utc.replace(tzinfo=UTC)) for record in records]


@admin_router.get("/usage")
def aggregate_usage(admin: Viewer, db: Db):
    billing.require_storage(db)
    records = billing.sql(db, "SELECT entitlement_code,feature,COUNT(*) AS total FROM free_ai_usage_events "
                          "GROUP BY entitlement_code,feature").mappings()
    return [dict(record) for record in records]


@admin_router.post("/orders/{reference}/retrieve-reversals")
def retrieve(reference: str, request: Request, admin: Manager, db: Db):
    config = payhere.configuration()
    billing.require_storage(db)
    order = billing.find(db, reference)
    if order is None:
        raise HTTPException(404, "Order not found.")
    if order.merchant_id != config.merchant:
        raise HTTPException(409, "The sandbox merchant for this order has changed.")
    admin_id = admin.id
    retrieved = payhere.retrieve_reversals(config, reference)
    # Accept each distinct reversal in its own provider event transaction.
    for event in retrieved:
        if billing.accept_event(db, config, event):
            record_admin_audit(db, admin_id=admin_id, action="billing.reversal_retrieved", entity="billing_order",
                               entity_id=reference, request=request, after={"provider_status": event.status})
            db.commit()
    return {"recorded": bool(retrieved)}
