"""PayHere sandbox protocol. Only allowlisted fields cross the adapter."""
import hashlib
import hmac
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from ipaddress import ip_address
from urllib.parse import parse_qsl, urlsplit

import httpx
from fastapi import HTTPException

from app.config import E2E_DB_NAME, E2E_MODE, settings

API = "https://sandbox.payhere.lk/merchant/v1"
NOTIFY_PATH = "/api/billing/payhere/notify"
STATUSES = {"0": "pending", "2": "paid", "-1": "cancelled", "-2": "failed", "-3": "chargeback"}
REVERSALS = {
    "REFUND REQUESTED": "refund_pending", "REFUND PROCESSING": "refund_pending",
    "REFUNDED": "refunded", "CHARGEBACKED": "chargeback",
}
ORDER_REF = re.compile(r"HB-[a-f0-9]{32}")
PAYMENT_ID = re.compile(r"[0-9]{1,32}")
@dataclass(frozen=True)
class Sandbox:
    merchant: str
    secret: str
    notify_url: str
    app_id: str | None = None
    app_secret: str | None = None


@dataclass(frozen=True)
class Event:
    order_ref: str
    payment_id: str
    status: str
    amount: Decimal
    currency: str
    source: str


def public_host(host):
    if not host:
        return False
    try:
        return ip_address(host).is_global
    except ValueError:
        host = host.rstrip(".").lower()
        return "." in host and not host.endswith((".localhost", ".local", ".internal", ".invalid", ".test"))


def configuration():
    # The same isolated database and deployment guard used by authenticated E2E.
    try:
        url = urlsplit(settings.A12_PAYHERE_NOTIFY_URL or "")
        valid_url = (url.scheme == "https" and public_host(url.hostname) and not url.username and not url.password
                     and not url.query and not url.fragment and url.path == NOTIFY_PATH)
    except ValueError:
        valid_url = False
    if not (E2E_MODE and settings.DB_NAME == E2E_DB_NAME and settings.A12_PAYHERE_SANDBOX_ENABLED
            and re.fullmatch(r"[0-9]{1,32}", settings.A12_PAYHERE_MERCHANT_ID or "")
            and settings.A12_PAYHERE_MERCHANT_SECRET and valid_url):
        raise HTTPException(503, "PayHere sandbox is unavailable.")
    return Sandbox(settings.A12_PAYHERE_MERCHANT_ID, settings.A12_PAYHERE_MERCHANT_SECRET.get_secret_value(),
                   settings.A12_PAYHERE_NOTIFY_URL, settings.A12_PAYHERE_APP_ID,
                   settings.A12_PAYHERE_APP_SECRET.get_secret_value() if settings.A12_PAYHERE_APP_SECRET else None)


def md5_upper(value):
    # PayHere requires this exact checksum; use it only for its protocol.
    return hashlib.md5(value.encode("utf-8"), usedforsecurity=False).hexdigest().upper()


def signature(config, order, amount, currency, status=""):
    return md5_upper(config.merchant + order + amount + currency + status + md5_upper(config.secret))


def checkout_payload(config, order):
    amount = format(order.amount_lkr, ".2f")
    return {"sandbox": True, "merchant_id": config.merchant, "notify_url": config.notify_url,
            "order_id": order.order_ref, "items": "HerBloom Premium (30 days)", "amount": amount,
            "currency": order.currency, "hash": signature(config, order.order_ref, amount, order.currency)}


def parse_amount(raw):
    if not isinstance(raw, str) or not re.fullmatch(r"[0-9]{1,7}(?:\.[0-9]{1,2})?", raw):
        raise ValueError("Invalid amount")
    return Decimal(raw)


def notification(config, body):
    names = {"merchant_id", "order_id", "payment_id", "payhere_amount", "payhere_currency", "status_code", "md5sig"}
    try:
        fields = {}
        for key, value in parse_qsl(body.decode("ascii"), keep_blank_values=True, strict_parsing=True,
                                    errors="strict", max_num_fields=64):
            if key in names:
                if key in fields:
                    raise ValueError("Duplicate field")
                fields[key] = value
        merchant, order, payment = (fields[k] for k in ("merchant_id", "order_id", "payment_id"))
        amount, currency, status, sig = (fields[k] for k in ("payhere_amount", "payhere_currency", "status_code", "md5sig"))
        if (merchant != config.merchant or not ORDER_REF.fullmatch(order) or not PAYMENT_ID.fullmatch(payment)
                or currency != "LKR" or status not in STATUSES or not re.fullmatch(r"[A-F0-9]{32}", sig)
                or not hmac.compare_digest(signature(config, order, amount, currency, status), sig)):
            raise ValueError("Invalid notification")
        return Event(order, payment, STATUSES[status], parse_amount(amount), currency, "notify")
    except (KeyError, ValueError, UnicodeError, InvalidOperation):
        raise HTTPException(400, "Invalid PayHere notification.") from None


def retrieve_reversals(config, order_ref):
    if not config.app_id or not config.app_secret:
        raise HTTPException(503, "PayHere sandbox retrieval is unavailable.")
    try:
        with httpx.Client(timeout=10, follow_redirects=False, trust_env=False) as client:
            auth = client.post(API + "/oauth/token", auth=(config.app_id, config.app_secret),
                               data={"grant_type": "client_credentials"})
            auth.raise_for_status()
            credentials = auth.json()
            token = credentials["access_token"]
            if credentials["scope"] != "SANDBOX" or not isinstance(token, str) or not token:
                raise ValueError("Invalid sandbox token response")
            response = client.get(API + "/payment/search", params={"order_id": order_ref},
                                  headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
            response.raise_for_status()
            payload = response.json()
        if payload["status"] in (0, -1):
            return []
        if payload["status"] != 1 or not isinstance(payload["data"], list):
            raise ValueError("Unexpected retrieval status")
        events = []
        for row in payload["data"]:
            state = REVERSALS.get(row["status"])
            if not state:
                continue
            payment = str(row["payment_id"])
            if row["order_id"] != order_ref or row["currency"] != "LKR" or not PAYMENT_ID.fullmatch(payment):
                raise ValueError("Invalid retrieved reversal")
            events.append(Event(order_ref, payment, state, parse_amount(str(row["amount"])), "LKR", "retrieval"))
        return events
    except (httpx.HTTPError, KeyError, ValueError, TypeError, InvalidOperation):
        raise HTTPException(502, "PayHere sandbox retrieval failed.") from None
