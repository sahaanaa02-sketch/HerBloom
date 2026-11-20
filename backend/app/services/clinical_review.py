import hashlib
import json
from calendar import monthrange
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import MetaData, Table, func, inspect, select

from app.models.article import Article
from app.models.chat import ArticleChunk
from app.models.nutrition import NutritionTarget
from app.services.admin_audit import record_admin_audit
from app.services.article_search import split_chunks


ENTITIES = {
    "articles": ("content", "title_en"),
    "recovery_exercises": ("content", "name"),
    "wellbeing_activities": ("content", "title"),
    "meal_ideas": ("content", "title"),
    "warning_signs": ("safety", "text_en"),
    "red_flag_terms": ("safety", "term"),
    "safety_messages": ("safety", "message_key"),
    "helplines": ("safety", "name_en"),
    "daily_tips": ("content", "text_en"),
    "nutrition_target_values": ("nutrition", "nutrient"),
}
METADATA = {"id", "created_at", "updated_at", "created_by", "updated_by", "reviewed_by",
            "review_date", "reviewed_at", "next_review_due", "status", "editorial_status", "published"}


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def ready(db):
    # The publication table is created last and serves as the migration readiness marker.
    return inspect(db.connection()).has_table("clinical_publications")


def require_ready(db):
    if not ready(db):
        raise HTTPException(503, "Clinical review is awaiting its database migration.")


def reflected(db, name):
    return Table(name, MetaData(), autoload_with=db.connection(), resolve_fks=False)


def row(db, table, id, lock=False):
    query = select(table).where(table.c.id == id)
    if lock:
        query = query.with_for_update()
    result = db.execute(query).mappings().one_or_none()
    if result is None:
        raise HTTPException(404, "Review or content record not found.")
    return dict(result)


def snapshot(db, entity, record):
    import datetime as dt
    result = {k: v.isoformat() if isinstance(v, (dt.date, dt.datetime)) else v
              for k, v in record.items() if k not in METADATA}
    if entity == "meal_ideas":
        result["food_ingredients"] = [
            {"food_id": r.food_id, "grams": str(r.grams)}
            for r in db.connection().exec_driver_sql(
                "SELECT food_id, grams FROM meal_idea_ingredients WHERE meal_idea_id=%s ORDER BY food_id",
                (record["id"],))
        ]
    return result


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(",", ":")).encode()).hexdigest()


def series(entity, record):
    return record["message_key"] if entity == "safety_messages" else str(record["id"])


def supersede(db, entity, id):
    if not ready(db):
        return
    reviews = reflected(db, "content_reviews")
    db.execute(reviews.update().where(reviews.c.entity == entity, reviews.c.entity_id == id,
                                     reviews.c.superseded_at.is_(None)).values(superseded_at=now()))


def submit(db, entity, id, admin_id):
    if not ready(db):
        return
    # Existing resource handlers already hold the content row lock.
    content = row(db, reflected(db, entity), id, lock=True)
    supersede(db, entity, id)
    data = snapshot(db, entity, content)
    reviews = reflected(db, "content_reviews")
    db.execute(reviews.insert().values(entity=entity, entity_id=id, submitted_by=admin_id,
                                       revision_hash=fingerprint(data), submitted_snapshot=data))


def status_field(content):
    return "editorial_status" if "editorial_status" in content.c else "status"


def is_live(entity, record):
    if entity == "nutrition_target_values":
        return record["status"] == "approved"
    return record.get("editorial_status", record.get("status")) == "published"


def last_publication(db, entity, record):
    p = reflected(db, "clinical_publications")
    return db.execute(select(p).where(p.c.entity == entity, p.c.series_key == series(entity, record))
                      .order_by(p.c.id.desc()).limit(1)).mappings().first()


def update_state(db, content, id, **values):
    db.execute(content.update().where(content.c.id == id).values(**values))


def review_fields(entity, reviewer_id, reviewer_name, stamp):
    if entity in {"articles", "recovery_exercises"}:
        return {"reviewed_by": reviewer_name, "review_date": stamp.date() if stamp else None}
    if ENTITIES[entity][0] == "safety" or entity == "daily_tips":
        return {"reviewed_by": reviewer_id, "reviewed_at": stamp}
    if entity == "nutrition_target_values":
        return {"reviewed_by": reviewer_id}
    return {}


def record_decision(db, review_id, action, comment, admin, request, authorize):
    require_ready(db)
    reviews = reflected(db, "content_reviews")
    initial = row(db, reviews, review_id)
    entity = initial["entity"]
    authorize(admin, entity)
    content = reflected(db, entity)
    record = row(db, content, initial["entity_id"], lock=True)
    review = row(db, reviews, review_id, lock=True)
    if review["decision"] != "pending" or review["superseded_at"] is not None:
        raise HTTPException(409, "This review has already been decided or superseded.")
    phase = record[status_field(content)]
    if phase != "in_review" and not is_live(entity, record):
        raise HTTPException(409, "This record is no longer in review.")
    if fingerprint(snapshot(db, entity, record)) != review["revision_hash"]:
        raise HTTPException(409, "The submitted revision has changed. Submit it again.")
    stamp = now()
    next_year = stamp.year + 1
    due = stamp.date().replace(year=next_year, day=min(stamp.day, monthrange(next_year, stamp.month)[1]))
    update_state(db, reviews, review_id, reviewer_id=admin.id, decision=action,
                 comment=comment, decided_at=stamp, next_review_due=due if action == "approved" else None)
    if action == "approved" and phase == "in_review":
        fields = review_fields(entity, admin.id, admin.name, stamp)
        if fields:
            update_state(db, content, record["id"], **fields)
    if action == "changes_requested" and phase == "in_review" and ENTITIES[entity][0] != "safety":
        update_state(db, content, record["id"], **{status_field(content): "draft"})
    record_admin_audit(db, admin_id=admin.id, action=f"clinical_review.{action}", entity=entity,
                       entity_id=record["id"], request=request,
                       after={"review_id": review_id, "decision": action, "comment": comment})
    db.commit()
    return {"id": review_id, "decision": action, "reviewed_by": admin.id,
            "reviewed_at": stamp, "next_review_due": due if action == "approved" else None}


def project_target(db, record):
    primary = {"calories", "protein", "iron", "calcium"}
    if record["nutrient"] not in primary:
        return
    methods = ("breast", "both") if record["feeding_group"] == "breastfeeding" else ("formula",)
    for method in methods:
        target = db.scalar(select(NutritionTarget).where(NutritionTarget.feeding_method == method).with_for_update())
        if target is None:
            target = NutritionTarget(feeding_method=method, reviewed=True)
            db.add(target)
        elif not target.reviewed:
            for field in primary:
                setattr(target, field, None)
            target.reviewed = True
        setattr(target, record["nutrient"], record["value"])


def publish(db, review_id, admin, request, authorize, publisher_label):
    require_ready(db)
    reviews = reflected(db, "content_reviews")
    initial = row(db, reviews, review_id)
    entity = initial["entity"]
    authorize(admin, entity)
    content = reflected(db, entity)
    record = row(db, content, initial["entity_id"], lock=True)
    review = row(db, reviews, review_id, lock=True)
    current = snapshot(db, entity, record)
    publications = reflected(db, "clinical_publications")
    exists = db.scalar(select(publications.c.id).where(publications.c.review_id == review_id))
    if (record[status_field(content)] != "in_review" and not is_live(entity, record)
            or review["decision"] != "approved" or review["superseded_at"] is not None
            or not review["reviewer_id"] or not review["decided_at"] or not review["next_review_due"]
            or review["next_review_due"] < now().date()
            or exists or fingerprint(current) != review["revision_hash"]):
        raise HTTPException(409, "A current and unused approval is required to publish.")
    previous = last_publication(db, entity, record)
    if entity == "safety_messages" and previous and previous["snapshot"]["version"] > record["version"]:
        raise HTTPException(409, "A newer message version is already published.")
    update = {status_field(content): "published"}
    update.update(review_fields(entity, review["reviewer_id"],
                                publisher_label(db, review["reviewer_id"]), review["decided_at"]))
    if entity == "articles":
        update["published"] = True
    if entity == "nutrition_target_values":
        update.update(status="approved", reviewed_by=review["reviewer_id"])
        project_target(db, record)
    update_state(db, content, record["id"], **update)
    if entity == "articles":
        db.execute(ArticleChunk.__table__.delete().where(ArticleChunk.article_id == record["id"]))
        for lang in ("en", "ta"):
            db.add_all(ArticleChunk(article_id=record["id"], language=lang, chunk_index=i, content=text)
                       for i, text in enumerate(split_chunks(record["body_" + lang])))
    db.execute(publications.insert().values(entity=entity, entity_id=record["id"],
               series_key=series(entity, record), review_id=review_id, published_by=admin.id,
               next_review_due=review["next_review_due"], snapshot=current))
    record_admin_audit(db, admin_id=admin.id, action="clinical_review.published", entity=entity,
                       entity_id=record["id"], request=request,
                       before=previous["snapshot"] if previous else None,
                       after={"review_id": review_id, "content": current})
    db.commit()
    return {"id": review_id, "status": "published"}
