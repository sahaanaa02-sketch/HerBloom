"""Sandbox orders, transactionally verified grants, and reconciliation records."""
from datetime import UTC
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import inspect

from app.services import entitlements, free_quota, payhere

PUBLIC = ("order_ref", "amount_lkr", "currency", "status", "review_required",
          "created_at_utc", "verified_at_utc")


def ready(db):
    return inspect(db.connection()).has_table("billing_payment_events")


def available(db):
    if not ready(db):
        return False
    try:
        payhere.configuration()
    except HTTPException:
        return False
    return True


def require_storage(db):
    if not ready(db):
        raise HTTPException(503, "Billing is awaiting its database migration.")


def now():
    return entitlements.utc_naive(free_quota.utc_now())


def sql(db, query, params=()):
    return db.connection().exec_driver_sql(query, params)


def public_order(row):
    result = {name: row[name] for name in PUBLIC}
    result["amount_lkr"] = format(result["amount_lkr"], ".2f")
    for key in ("created_at_utc", "verified_at_utc"):
        if result[key]:
            result[key] = result[key].replace(tzinfo=UTC)
    return result


def find(db, reference, owner=None, lock=False):
    query = "SELECT * FROM billing_orders WHERE order_ref=%s"
    params = (reference,)
    if owner is not None:
        query += " AND user_id=%s"
        params += (owner,)
    if lock:
        query += " FOR UPDATE"
    return sql(db, query, params).mappings().one_or_none()


def owner_order(db, reference, user_id):
    require_storage(db)
    row = find(db, reference, owner=user_id)
    if row is None:
        raise HTTPException(404, "Order not found.")
    return row


def history(db, user_id, before=None):
    if not ready(db):
        return {"items": [], "next_before": None}
    limit = " AND id<%s" if before is not None else ""
    params = (user_id, before) if before is not None else (user_id,)
    rows = sql(db, "SELECT * FROM billing_orders WHERE user_id=%s" + limit + " ORDER BY id DESC LIMIT 21", params).mappings().all()
    return {"items": [public_order(row) for row in rows[:20]],
            "next_before": rows[19]["id"] if len(rows) > 20 else None}


def checkout(db, user_id, key):
    config = payhere.configuration()
    require_storage(db)
    entitlements.require_ready(db)
    try:
        key = str(UUID(key or ""))
    except ValueError:
        raise HTTPException(422, "A valid Idempotency-Key header is required.") from None
    account = entitlements.lock_account(db, user_id)
    entitlements.current(db, user_id, free_quota.utc_now(), account.activated_at_utc)
    current = sql(db, "SELECT * FROM billing_orders WHERE user_id=%s AND checkout_key=%s",
                  (user_id, key)).mappings().one_or_none()
    if current is None:
        if sql(db, "SELECT 1 FROM billing_orders WHERE user_id=%s AND status='pending' LIMIT 1", (user_id,)).first():
            raise HTTPException(409, "A payment is still pending. Check payment history.")
        reference = "HB-" + uuid4().hex
        amount = Decimal(entitlements.PLANS["premium"]["price_lkr"])
        sql(db, "INSERT INTO billing_orders "
            "(user_id,order_ref,checkout_key,merchant_id,amount_lkr,currency,created_at_utc)"
            " VALUES (%s,%s,%s,%s,%s,'LKR',%s)", (user_id, reference, key, config.merchant, amount, now()))
        current = find(db, reference, owner=user_id)
    if current.merchant_id != config.merchant:
        raise HTTPException(409, "The sandbox merchant for this order has changed.")
    result = public_order(current)
    result["checkout"] = payhere.checkout_payload(config, current) if current.status == "pending" else None
    db.commit()
    return result


REVERSAL_PRIORITY = {"refund_pending": 1, "refunded": 2, "chargeback": 3}


def accept_event(db, config, event):
    """Lock order owner first. Grant, order state and event history share a transaction."""
    require_storage(db)
    original = find(db, event.order_ref)
    if not original:
        raise HTTPException(404, "Order not found.")
    account = free_quota.lock_account(db, original.user_id, require_active=False)
    order = find(db, event.order_ref, lock=True)
    if (order is None or order.merchant_id != config.merchant or order.amount_lkr != event.amount
            or order.currency != event.currency):
        raise HTTPException(400, "Payment does not match the order.")
    if sql(db, "SELECT 1 FROM billing_payment_events WHERE order_id=%s AND source=%s "
           "AND provider_status=%s AND provider_payment_id=%s",
           (order.id, event.source, event.status, event.payment_id)).first():
        return False

    status = order.status
    review = order.review_required
    provider_id = order.provider_payment_id
    entitlement_id = order.entitlement_id
    verified_at = order.verified_at_utc
    if event.status in REVERSAL_PRIORITY:
        review = True
        if (provider_id is None or provider_id == event.payment_id) and (
                REVERSAL_PRIORITY[event.status] > REVERSAL_PRIORITY.get(status, 0)):
            status = event.status
            provider_id = event.payment_id
    elif event.status == "paid" and event.source == "notify":
        if provider_id and provider_id != event.payment_id:
            review = True
        elif status not in REVERSAL_PRIORITY and entitlement_id is None:
            status, provider_id, verified_at = "paid", event.payment_id, now()
            if account.is_active and account.activated_at_utc:
                entitlement_id = entitlements.apply_verified_purchase(
                    db, order.user_id, order.order_ref, locked_account=account)
            else:
                review = True
    elif status == "pending" and event.status in ("failed", "cancelled"):
        status = event.status

    sql(db, "INSERT INTO billing_payment_events (order_id,source,provider_status,provider_payment_id,received_at_utc)"
        " VALUES (%s,%s,%s,%s,%s)", (order.id, event.source, event.status, event.payment_id, now()))
    sql(db, "UPDATE billing_orders SET status=%s,review_required=%s,provider_payment_id=%s,entitlement_id=%s,"
        "verified_at_utc=%s WHERE id=%s", (status, review, provider_id, entitlement_id, verified_at, order.id))
    return True
