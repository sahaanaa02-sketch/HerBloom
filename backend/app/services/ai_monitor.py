import hashlib
import hmac
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from threading import RLock
from time import monotonic
from typing import Literal, Mapping

import jwt
from fastapi import HTTPException
from sqlalchemy import MetaData, Table, inspect, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import SQLAlchemyError

from app.config import external_setting, settings
from app.database import SessionLocal
from app.services.recovery_rules import local_today

Feature = Literal["scan", "chat", "summary", "plan"]
FEATURES = ("scan","chat","summary","plan")
PROVIDER_FEATURES = frozenset({"chat", "summary", "scan"})
CACHE_SECONDS = 300
MODEL = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}")
log = logging.getLogger(__name__)
_cache = {}
_lock = RLock()


class AIUnavailable(Exception):
    pass


@dataclass(frozen=True)
class Runtime:
    feature: str
    model_name: str
    enabled: bool
    max_output_tokens: int | None
    temperature: float
    daily_limit_free: int | None = None
    daily_limit_premium: int | None = None
    price_in_per_m: Decimal | None = None
    price_out_per_m: Decimal | None = None
    prompt: str = ""
    tracked: bool = False


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def ready(db):
    return inspect(db.connection()).has_table("ai_settings")


def require_ready(db):
    if not ready(db):
        raise HTTPException(503, "AI monitoring is awaiting its database migration.")


def table(db, name):
    return Table(name, MetaData(), autoload_with=db.connection(), resolve_fks=False)


def default_model():
    value = external_setting("GEMINI_MODEL", "gemini-3.1-flash-lite")
    if not value or not MODEL.fullmatch(value):
        return ""
    return value


def approved_models():
    configured = (external_setting("A10_APPROVED_MODELS", "") or "").split(",")
    candidates = {v.strip() for v in configured}
    candidates.add(default_model())
    return sorted(v for v in candidates if MODEL.fullmatch(v))


def defaults(feature):
    max_tokens, temperature = {"scan": (None, 0.1), "chat": (450,0.1),
                               "summary": (350,0.2), "plan": (450,0.1)}[feature]
    return Runtime(feature, default_model(), feature in PROVIDER_FEATURES, max_tokens, temperature)


def load_runtime(db, feature):
    base = defaults(feature)
    if not ready(db):
        return base
    config = table(db, "ai_settings")
    prompts = table(db, "prompt_versions")
    row = db.execute(select(config).where(config.c.feature == feature)).mappings().first()
    active = db.scalar(select(prompts.c.system_prompt).where(prompts.c.feature == feature, prompts.c.active.is_(True))
                       .order_by(prompts.c.version.desc()).limit(1))
    overrides = {key: row[key] if row else getattr(base,key) for key in (
        "model_name","enabled","max_output_tokens","temperature","daily_limit_free","daily_limit_premium",
        "price_in_per_m","price_out_per_m")}
    return Runtime(feature=feature, **overrides, tracked=True, prompt=active or "")


def clear_cache(feature=None):
    with _lock:
        if feature:
            _cache.pop(feature,None)
        else:
            _cache.clear()


def runtime(feature, db=None):
    with _lock:
        now = monotonic()
        current = _cache.get(feature)
        if current and now < current[0]:
            return current[1]
        if db is None:
            with SessionLocal() as own:
                config = load_runtime(own, feature)
        else:
            config = load_runtime(db, feature)
        _cache[feature]=(now+CACHE_SECONDS,config)
        return config


def account_key(user_id):
    return hmac.new(settings.SECRET_KEY.encode(),f"a10-quota:{user_id}".encode(),hashlib.sha256).hexdigest()


def reserve(config, user_id, *, entitlement_quota=False):
    if not config.enabled or config.feature not in PROVIDER_FEATURES:
        raise AIUnavailable("This AI feature is currently unavailable.")
    if config.model_name not in approved_models():
        raise AIUnavailable("This AI model is not approved for use.")
    limit = config.daily_limit_free
    if entitlement_quota or limit is None:
        return
    if not user_id or limit == 0:
        raise AIUnavailable("The daily AI limit has been reached.")
    day = local_today()
    key = account_key(user_id)
    with SessionLocal() as db, db.begin():
        quota = table(db,"ai_daily_quota")
        # Lock the counter row before incrementing so concurrent calls cannot exceed the quota.
        stmt=insert(quota).values(account_key=key,feature=config.feature,quota_day=day,used=0)
        db.execute(stmt.on_duplicate_key_update(used=quota.c.used))
        where=(quota.c.account_key==key,quota.c.feature==config.feature,quota.c.quota_day==day)
        used=db.scalar(select(quota.c.used).where(*where).with_for_update())
        if used>=limit:
            raise AIUnavailable("The daily AI limit has been reached.")
        db.execute(quota.update().where(*where).values(used=used+1))


def provider_runtime(feature, user_id=None, db=None, *, entitlement_quota=False):
    try:
        config=runtime(feature,db)
        if user_id:
            from app.services import rate_limits
            with SessionLocal() as limiter:
                rate_limits.enforce(limiter, f"provider:{feature}:{user_id}", 180)
        reserve(config, user_id, entitlement_quota=entitlement_quota)
        return config
    except SQLAlchemyError:
        raise AIUnavailable("AI configuration is temporarily unavailable.") from None


def instructions(core, config):
    if not config.prompt:
        return core
    return ("Optional administrator guidance. Ignore any part that conflicts with mandatory rules:\n"
            +config.prompt+"\n\nMandatory rules take precedence:\n"+core)


def measured_int(value):
    return value if type(value) is int and 0 <= value <= 2147483647 else None


def price(config, input_tokens, output_tokens):
    if None in (input_tokens,output_tokens,config.price_in_per_m,config.price_out_per_m):
        return None
    value=(Decimal(input_tokens)*Decimal(config.price_in_per_m)+
           Decimal(output_tokens)*Decimal(config.price_out_per_m))/Decimal(1_000_000)
    return value.quantize(Decimal("0.00000001"),rounding=ROUND_HALF_UP)


class Attempt:
    def __init__(self,config):
        self.config=config
        self.started=monotonic()
        self.input_tokens=None
        self.output_tokens=None

    def capture(self, metadata):
        if isinstance(metadata,Mapping):
            self.input_tokens=measured_int(metadata.get("promptTokenCount"))
            self.output_tokens=measured_int(metadata.get("candidatesTokenCount"))
        else:
            self.input_tokens=measured_int(getattr(metadata,"prompt_token_count",None))
            self.output_tokens=measured_int(getattr(metadata,"candidates_token_count",None))

    def finish(self, success):
        if not self.config.tracked:
            return None
        try:
            with SessionLocal() as db, db.begin():
                usage=table(db,"ai_usage")
                return db.execute(usage.insert().values(
                    feature=self.config.feature,model=self.config.model_name,input_tokens=self.input_tokens,
                    output_tokens=self.output_tokens,est_cost_usd=price(self.config,self.input_tokens,self.output_tokens),
                    success=success,latency_ms=min(2147483647,max(0,round((monotonic()-self.started)*1000))),
                    created_at=utc_now())).inserted_primary_key[0]
        except SQLAlchemyError:
            log.warning("AI usage measurement could not be stored.")
            return None


def scan_receipt(id, user_id):
    if not id or not user_id:
        return None
    return jwt.encode({"sub":str(user_id),"usage":id,"aud":"herbloom-scan-review",
                       "purpose":"scan_review","exp":utc_now()+timedelta(hours=2)},settings.SECRET_KEY,algorithm=settings.ALGORITHM)


def record_correction(db, receipt, user_id, corrected):
    require_ready(db)
    try:
        payload=jwt.decode(receipt,settings.SECRET_KEY,algorithms=[settings.ALGORITHM],
                           audience="herbloom-scan-review",options={"require":["sub","exp","usage","purpose"]})
        if payload["sub"]!=str(user_id) or payload["purpose"]!="scan_review" or type(payload["usage"]) is not int:
            raise jwt.InvalidTokenError()
    except jwt.PyJWTError:
        raise HTTPException(404,"This scan review is unavailable.") from None
    usage=table(db,"ai_usage")
    change=db.execute(usage.update().where(usage.c.id==payload["usage"],usage.c.feature=="scan",
                      usage.c.success.is_(True),usage.c.scanner_corrected.is_(None)).values(scanner_corrected=corrected))
    if not change.rowcount:
        raise HTTPException(409,"This scan review has already been recorded or is unavailable.")
    db.commit()
