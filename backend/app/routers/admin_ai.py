from dataclasses import asdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import and_, case, func, select
from sqlalchemy.dialects.mysql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import require_admin_permission
from app.models.admin import AdminUser
from app.models.chat import ChatFeedback, ChatSession
from app.services import ai_monitor as monitor
from app.services.admin_audit import record_admin_audit

router = APIRouter(prefix="/api/admin/ai", tags=["AI Monitoring"])
Db = Annotated[Session, Depends(get_db)]
Viewer = Annotated[AdminUser, Depends(require_admin_permission("ai.view"))]
Manager = Annotated[AdminUser, Depends(require_admin_permission("ai.manage"))]
Status = Literal["new","reviewed","content_fixed"]
TokenPrice = Annotated[Decimal, Field(ge=0, le=10000, max_digits=12, decimal_places=6)]


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class AISettings(Payload):
    enabled: bool = Field(strict=True)
    model_name: str = Field(min_length=1,max_length=100)
    max_output_tokens: int | None = Field(ge=1,le=65536,strict=True)
    temperature: Decimal = Field(ge=0,le=2,decimal_places=3)
    daily_limit_free: int | None = Field(default=None,ge=0,le=10000,strict=True)
    daily_limit_premium: int | None = Field(default=None,ge=0,le=10000,strict=True)
    price_in_per_m: TokenPrice | None = None
    price_out_per_m: TokenPrice | None = None

    @model_validator(mode="after")
    def pricing_complete(self):
        if (self.price_in_per_m is None) != (self.price_out_per_m is None):
            raise ValueError("Supply both token prices, or leave both blank.")
        return self


class PromptDraft(Payload):
    system_prompt: str = Field(min_length=1,max_length=8000)


class FeedbackDecision(Payload):
    status: Status
    reviewer_note: str = Field(default="",max_length=2000)


def audit(db, admin, request, action, entity, id, before=None, after=None):
    record_admin_audit(db,admin_id=admin.id,action=action,entity=entity,entity_id=id,
                       request=request,before=before,after=after)


def summary(db, u, predicate, grouping=None):
    calls=func.count(u.c.id).label("calls")
    fields=[calls,func.count(case((u.c.success.is_(True),1))).label("successes"),
            func.sum(u.c.input_tokens).label("input_tokens"),func.sum(u.c.output_tokens).label("output_tokens"),
            func.sum(u.c.est_cost_usd).label("cost_usd"),func.count(u.c.est_cost_usd).label("priced_calls"),
            func.avg(u.c.latency_ms).label("average_latency_ms")]
    if grouping is None:
        return db.execute(select(*fields).where(*predicate)).mappings().one()
    rows=db.execute(select(grouping.label("key"),*fields).where(*predicate).group_by(grouping)
                    .order_by(grouping)).mappings()
    return {r["key"]:r for r in rows}


def metrics(row=None):
    if row is None:
        return {"calls":0,"successes":0,"input_tokens":None,"output_tokens":None,"cost_usd":None,
                "priced_calls":0,"average_latency_ms":None,"success_rate":None}
    data={key:float(value) if isinstance(value,Decimal) else value for key,value in row.items() if key!="key"}
    for key in ("input_tokens","output_tokens"):
        if row[key] is not None:
            data[key]=int(row[key])
    data["success_rate"]=round(100*data["successes"]/data["calls"],2) if data["calls"] else None
    return data


@router.get("/usage")
def usage(admin: Viewer, db: Db, start: date | None=None, end: date | None=None,
          feature: monitor.Feature | None=None):
    monitor.require_ready(db)
    today=monitor.utc_now().date()
    end=end or today
    start=start or end-timedelta(days=29)
    if start>end or end>today or start.year<2000 or (end-start).days>91:
        raise HTTPException(422,"Choose a date range of at most 92 days ending today or earlier.")
    u=monitor.table(db,"ai_usage")
    base=[u.c.created_at>=datetime.combine(start,time.min),u.c.created_at<datetime.combine(end+timedelta(days=1),time.min)]
    filt=base+([u.c.feature==feature] if feature else [])
    day_map=summary(db,u,filt,func.date(u.c.created_at))
    by_feature=summary(db,u,filt,u.c.feature)
    month=datetime.combine(today.replace(day=1),time.min)
    month_totals=metrics(summary(db,u,[u.c.created_at>=month,u.c.created_at<=monitor.utc_now()]))
    scan=db.execute(select(func.count(u.c.id),func.count(u.c.scanner_corrected),
                  func.count(case((u.c.scanner_corrected.is_(True),1))))
                  .where(*base,u.c.feature=="scan",u.c.success.is_(True))).one()
    return {"start":start,"end":end,"as_of":today,"totals":metrics(summary(db,u,filt)),"month_to_date":month_totals,
            "daily":[{"date":start+timedelta(days=i),**metrics(day_map.get(start+timedelta(days=i)))}
                     for i in range((end-start).days+1)],
            "by_feature":[{"feature":f,**metrics(by_feature.get(f))} for f in monitor.FEATURES if not feature or f==feature],
            "scanner":{"successful":scan[0],"reviewed":scan[1],"corrected":scan[2],
                       "correction_rate":round(100*scan[2]/scan[1],2) if scan[1] else None}}


def safe_settings(runtime):
    result=asdict(runtime)
    result.pop("prompt")
    result.pop("tracked")
    result["connected"]=runtime.feature in monitor.PROVIDER_FEATURES
    return result


@router.get("/settings")
def list_settings(admin: Viewer, db: Db):
    monitor.require_ready(db)
    return {"items":[safe_settings(monitor.load_runtime(db,f)) for f in monitor.FEATURES],
            "approved_models":monitor.approved_models()}


@router.put("/settings/{feature}")
def save_settings(feature: monitor.Feature, body: AISettings, request: Request, admin: Manager, db: Db):
    monitor.require_ready(db)
    if body.model_name not in monitor.approved_models():
        raise HTTPException(422,"Select a model from the configured approved list.")
    if feature not in monitor.PROVIDER_FEATURES and body.enabled:
        raise HTTPException(422,"The deterministic planner has no AI provider connection.")
    if body.max_output_tokens is None and feature!="scan":
        raise HTTPException(422,"Maximum output tokens are required.")
    t=monitor.table(db,"ai_settings")
    db.execute(select(t.c.feature).where(t.c.feature==feature).with_for_update()).first()
    before=safe_settings(monitor.load_runtime(db,feature))
    stmt=insert(t).values(feature=feature,**body.model_dump(),updated_by=admin.id)
    db.execute(stmt.on_duplicate_key_update(**{k:stmt.inserted[k] for k in (*AISettings.model_fields,"updated_by")}))
    after=safe_settings(monitor.load_runtime(db,feature))
    audit(db,admin,request,"ai_settings.updated","ai_settings",feature,jsonable_encoder(before),jsonable_encoder(after))
    db.commit()
    monitor.clear_cache(feature)
    return after


@router.get("/prompts/{feature}")
def prompts(feature: monitor.Feature, admin: Viewer, db: Db, page: int=Query(1,ge=1),
            page_size: int=Query(10,ge=1,le=100)):
    monitor.require_ready(db)
    t=monitor.table(db,"prompt_versions")
    q=select(t).where(t.c.feature==feature)
    rows=db.execute(q.order_by(t.c.version.desc()).offset((page-1)*page_size).limit(page_size)).mappings()
    return {"items":[dict(r) for r in rows],"total":db.scalar(select(func.count()).select_from(q.subquery()))}


@router.post("/prompts/{feature}",status_code=201)
def add_prompt(feature: monitor.Feature, body: PromptDraft, request: Request, admin: Manager, db: Db):
    monitor.require_ready(db)
    t=monitor.table(db,"prompt_versions")
    try:
        version=(db.scalar(select(func.max(t.c.version)).where(t.c.feature==feature)) or 0)+1
        id=db.execute(t.insert().values(feature=feature,version=version,system_prompt=body.system_prompt,
                     active=False,created_by=admin.id)).inserted_primary_key[0]
        audit(db,admin,request,"prompt_versions.created","prompt_versions",id,after={"feature":feature,"version":version})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,"A version was created concurrently. Refresh and try again.") from None
    return {"id":id,"feature":feature,"version":version,"active":False}


@router.post("/prompts/{feature}/{id:int}/activate")
def activate_prompt(feature: monitor.Feature,id: int,request: Request,admin: Manager,db: Db):
    monitor.require_ready(db)
    t=monitor.table(db,"prompt_versions")
    rows=db.execute(select(t.c.id,t.c.version,t.c.active).where(t.c.feature==feature)
                    .order_by(t.c.id).with_for_update()).all()
    target=next((row for row in rows if row.id==id),None)
    if target is None:
        raise HTTPException(404,"Prompt version not found.")
    old=next((row.version for row in rows if row.active),None)
    if target.active:
        return {"version":target.version,"active":True}
    db.execute(t.update().where(t.c.feature==feature,t.c.active.is_(True)).values(active=False))
    db.execute(t.update().where(t.c.id==id).values(active=True))
    audit(db,admin,request,"prompt_versions.activated","prompt_versions",id,
          {"version":old},{"feature":feature,"version":target.version})
    db.commit()
    monitor.clear_cache(feature)
    return {"version":target.version,"active":True}


def feedback_query(db, detail=False):
    f=ChatFeedback.__table__
    s=ChatSession.__table__
    reviews=monitor.table(db,"ai_feedback_reviews")
    messages=monitor.table(db,"chat_messages")
    answer=messages.alias("answer")
    consent=reviews.c.share_content.is_(True)
    status=func.coalesce(reviews.c.status,"new")
    fields=[f.c.id,answer.c.created_at,answer.c.language,answer.c.sources,status.label("status"),
            reviews.c.reviewer_note,consent.label("shared")]
    joins=f.join(answer,answer.c.id==f.c.message_id).join(s,and_(s.c.id==answer.c.session_id,s.c.user_id==f.c.user_id))
    joins=joins.outerjoin(reviews,reviews.c.feedback_id==f.c.id)
    if detail:
        question=messages.alias("question")
        joins=joins.outerjoin(question,and_(consent,question.c.id==answer.c.question_message_id,
                    question.c.session_id==answer.c.session_id,question.c.id<answer.c.id,question.c.role=="user"))
        fields+= [case((consent,answer.c.content)).label("answer"),question.c.content.label("question")]
    return select(*fields).select_from(joins).where(f.c.helpful.is_(False),answer.c.role=="assistant",
                                                    answer.c.message_type=="answer"),status,reviews


def feedback_row(record):
    data=dict(record)
    sources=data.pop("sources") or []
    data["sources"]=[{"article_id":r["article_id"],"title":r["title"][:250]} for r in sources if isinstance(r,dict)
                     and type(r.get("article_id")) is int and isinstance(r.get("title"),str)]
    return {**data,"feature":"chat"}


@router.get("/feedback")
def feedback(admin: Viewer,db: Db,status: Status | None=None,page: int=Query(1,ge=1),
             page_size: int=Query(10,ge=1,le=100)):
    monitor.require_ready(db)
    q,state,_=feedback_query(db)
    if status:
        q=q.where(state==status)
    sub=q.subquery()
    rows=db.execute(select(sub).order_by(sub.c.id.desc()).offset((page-1)*page_size).limit(page_size)).mappings()
    return {"items":[feedback_row(r) for r in rows],"total":db.scalar(select(func.count()).select_from(sub))}


@router.get("/feedback/{id:int}")
def feedback_detail(id: int,admin: Viewer,db: Db):
    monitor.require_ready(db)
    q,_,_=feedback_query(db,detail=True)
    row=db.execute(q.where(ChatFeedback.id==id)).mappings().one_or_none()
    if row is None:
        raise HTTPException(404,"Negative feedback not found.")
    return feedback_row(row)


@router.put("/feedback/{id:int}")
def review_feedback(id: int,body: FeedbackDecision,request: Request,admin: Manager,db: Db):
    monitor.require_ready(db)
    q,_,reviews=feedback_query(db)
    row=db.execute(q.where(ChatFeedback.id==id).with_for_update()).mappings().one_or_none()
    if row is None:
        raise HTTPException(404,"Negative feedback not found.")
    values=body.model_dump()|{"reviewed_by":admin.id,"reviewed_at":monitor.utc_now()}
    stmt=insert(reviews).values(feedback_id=id,share_content=False,**values)
    db.execute(stmt.on_duplicate_key_update(**values))
    audit(db,admin,request,"ai_feedback_reviews.updated","ai_feedback_reviews",id,
          {"status":row["status"]},{"status":body.status})
    db.commit()
    return {"status":body.status}
