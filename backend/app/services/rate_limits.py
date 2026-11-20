"""Operational request throttles backed by the existing A7 MySQL buckets."""
from fastapi import HTTPException
from sqlalchemy import inspect

from app.config import settings
from app.services.user_privacy import consume_limit


def source_ip(request):
    return request.client.host if request.client is not None else "unknown"


def enforce(db, bucket, limit, minutes=1):
    if not inspect(db.connection()).has_table("a7_rate_limits"):
        if settings.A14_HOSTED:
            raise HTTPException(503, "Request protection is unavailable.")
        return
    if not consume_limit(db, "a14:" + bucket, limit, minutes):
        raise HTTPException(429, "Too many requests. Try again shortly.",
                            headers={"Retry-After":str(minutes * 60)})
