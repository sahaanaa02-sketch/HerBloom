
from datetime import date as Date
from hashlib import sha256
from io import BytesIO
from uuid import UUID

from fastapi import (
    APIRouter, Depends, Header, HTTPException,
    UploadFile, File, Query
)
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool
from sqlalchemy import inspect, select, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, undefer

from app.database import get_db
from app.models.user import User
from app.models.mother_profile import MotherProfile
from app.models.nutrition import (
    Food, FoodAlias, FoodLog, FoodLogSave, FavoriteFood,
    MealIdea, MealPlan, MealPlanItem, HbRecord, meal_idea_columns
)
from app.routers.auth import require_mother
from app.schemas.nutrition import (
    FoodLogCreate, FoodLogUpdate,
    HbCreate, PlanItemUpdate
)
from app.services.nutrition_service import (
    today, daily_summary
)
from app.services.meal_plan_service import (
    generate_plan, plan_response,
    requires_dietary_review
)
from app.services.food_scanner import scan_food
from app.services import ai_monitor as monitor
from app.services import analytics, free_quota
from pydantic import BaseModel, ConfigDict, Field
from app.services.food_matching import match_scanned_foods


router = APIRouter(
    prefix="/nutrition",
    tags=["Nutrition and Anaemia"]
)


def serialize_food(food):
    return {
        "id": food.id,
        "name_en": food.name_en,
        "name_ta": food.name_ta,
        "category": food.category,
        "calories": food.calories if food.verified else None,
        "protein": food.protein if food.verified else None,
        "iron": food.iron if food.verified else None,
        "calcium": food.calcium if food.verified else None,
        "source": food.source,
        "verified": food.verified,
    }


def own_log(db, user_id, log_id):
    log = db.scalar(
        select(FoodLog).where(
            FoodLog.id == log_id,
            FoodLog.user_id == user_id,
        )
    )
    if not log:
        raise HTTPException(404, "Meal not found.")
    return log


def own_plan_item(db, user_id, item_id):
    item = db.scalar(
        select(MealPlanItem)
        .join(MealPlan, MealPlan.id == MealPlanItem.plan_id)
        .where(MealPlanItem.id == item_id, MealPlan.user_id == user_id)
        .with_for_update(of=MealPlanItem)
    )
    if not item:
        raise HTTPException(404, "Plan item not found.")

    return item


@router.get("/foods")
def search_foods(
    q: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    extra_fields = ("carbs_g", "fat_g", "fibre_g", "missing_nutrients")
    columns = {column["name"] for column in inspect(db.connection()).get_columns("foods")}
    available = tuple(field for field in extra_fields if field in columns)
    stmt = select(Food).options(*(undefer(getattr(Food, field)) for field in available))

    if q.strip():
        term = q.strip()
        aliases = select(FoodAlias.food_id).where(
            FoodAlias.alias.ilike(f"%{term}%")
        )
        stmt = stmt.where(
            or_(
                Food.name_en.ilike(f"%{term}%"),
                Food.name_ta.ilike(f"%{term}%"),
                Food.id.in_(aliases),
            )
        )

    foods = db.scalars(
        stmt.order_by(Food.name_en).limit(100)
    ).all()

    results = []
    for food in foods:
        result = serialize_food(food)
        for field in extra_fields[:-1]:
            result[field] = getattr(food, field) if food.verified and field in available else None
        if "missing_nutrients" in available:
            for field in food.missing_nutrients or []:
                if field in ("calories", "protein", "iron", "calcium", *extra_fields[:-1]):
                    result[field] = None
        results.append(result)
    return results


@router.get("/today")
def nutrition_today(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    return daily_summary(db, user.id)


@router.get("/logs")
def food_logs(
    date: Date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    return daily_summary(db, user.id, date)


@router.post("/meals", status_code=201)
def create_meal(
    payload: FoodLogCreate,
    idempotency_key: UUID | None = Header(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    receipt_key = (user.id, str(idempotency_key))
    payload_hash = None
    if idempotency_key is not None:
        if not inspect(db.connection()).has_table(FoodLogSave.__tablename__):
            raise HTTPException(503, "Retry-safe meal saving is unavailable.")
        payload_hash = sha256(payload.model_dump_json().encode()).hexdigest()
        previous = db.get(FoodLogSave, receipt_key)
        if previous is not None:
            return replay_meal_save(previous, payload_hash)

    if not db.get(Food, payload.food_id):
        raise HTTPException(404, "Food not found.")

    day = payload.date or today()

    if day > today():
        raise HTTPException(422, "Future dates are not allowed.")

    row = FoodLog(
        user_id=user.id,
        food_id=payload.food_id,
        date=day,
        meal_type=payload.meal_type,
        grams=payload.grams,
    )
    db.add(row)
    try:
        db.flush()
        log_id = row.id
        if payload_hash is not None:
            db.add(FoodLogSave(
                user_id=receipt_key[0], request_key=receipt_key[1],
                payload_hash=payload_hash, response_id=log_id,
            ))
        db.commit()
    except IntegrityError:
        db.rollback()
        previous = db.get(FoodLogSave, receipt_key) if payload_hash is not None else None
        if previous is None:
            raise
        return replay_meal_save(previous, payload_hash)

    return {"id": log_id, "message": "Meal saved."}


def replay_meal_save(receipt: FoodLogSave, payload_hash: str):
    if receipt.payload_hash != payload_hash:
        raise HTTPException(409, "This save request already used different meal details.")
    return {"id": receipt.response_id, "message": "Meal saved."}


@router.patch("/meals/{log_id}")
def update_meal(
    log_id: int,
    payload: FoodLogUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    row = own_log(db, user.id, log_id)
    changes = payload.model_dump(exclude_unset=True)

    if "food_id" in changes:
        if not db.get(Food, changes["food_id"]):
            raise HTTPException(404, "Food not found.")

    linked = db.scalar(
        select(MealPlanItem).where(
            MealPlanItem.food_log_id == row.id
        )
    )

    if linked:
        raise HTTPException(
            409,
            "Uncheck this meal in the weekly plan "
            "before editing it.",
        )

    for key, value in changes.items():
        if value is None:
            raise HTTPException(
                422, f"{key} cannot be null."
            )
        setattr(row, key, value)

    db.commit()
    return {"id": row.id, "message": "Meal updated."}


@router.delete("/meals/{log_id}")
def delete_meal(
    log_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    row = own_log(db, user.id, log_id)

    linked = db.scalars(
        select(MealPlanItem).where(
            MealPlanItem.food_log_id == row.id
        )
    ).all()

    for item in linked:
        item.food_log_id = None
        item.eaten = False

    db.delete(row)
    db.commit()
    return {"message": "Meal deleted."}


@router.get("/favourites")
def get_favourites(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    rows = db.scalars(
        select(FavoriteFood).where(
            FavoriteFood.user_id == user.id
        )
    ).all()

    return [
        serialize_food(food)
        for row in rows
        if (food := db.get(Food, row.food_id)) is not None
    ]


@router.post("/favourites/{food_id}")
def add_favourite(
    food_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    if not db.get(Food, food_id):
        raise HTTPException(404, "Food not found.")

    existing = db.scalar(
        select(FavoriteFood).where(
            FavoriteFood.user_id == user.id,
            FavoriteFood.food_id == food_id,
        )
    )

    if not existing:
        db.add(FavoriteFood(
            user_id=user.id, food_id=food_id
        ))
        db.commit()

    return {"message": "Added to favourites."}


@router.delete("/favourites/{food_id}")
def remove_favourite(
    food_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    row = db.scalar(
        select(FavoriteFood).where(
            FavoriteFood.user_id == user.id,
            FavoriteFood.food_id == food_id,
        )
    )

    if row:
        db.delete(row)
        db.commit()

    return {"message": "Removed from favourites."}


@router.get("/ideas")
def get_meal_ideas(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    query = select(
        MealIdea.id, MealIdea.title, MealIdea.description, MealIdea.category,
        MealIdea.ingredients, MealIdea.tags,
    )
    columns = meal_idea_columns(db)
    if "editorial_status" in columns:
        query = query.where(MealIdea.editorial_status.is_(None) | (MealIdea.editorial_status == "published"))
    language = db.scalar(select(MotherProfile.language).where(MotherProfile.user_id == user.id))
    if language == "ta" and {"title_ta", "description_ta"} <= columns:
        query = query.add_columns(MealIdea.title_ta, MealIdea.description_ta)
    rows = db.execute(query.order_by(MealIdea.id)).all()

    return [
        {
            "id": r.id,
            "title": getattr(r, "title_ta", None) or r.title,
            "description": getattr(r, "description_ta", None) or r.description,
            "category": r.category,
            "ingredients": r.ingredients,
            "tags": r.tags,
        }
        for r in rows
    ]


@router.get("/meal-plan")
def get_meal_plan(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    plan = db.scalar(
        select(MealPlan).where(
            MealPlan.user_id == user.id
        ).order_by(MealPlan.id.desc())
    )
    return plan_response(db, plan)


@router.get("/meal-plan/history")
def meal_plan_history(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    plans = db.scalars(
        select(MealPlan).where(
            MealPlan.user_id == user.id
        ).order_by(MealPlan.start_date.desc()).limit(20)
    ).all()

    return [
        {
            "id": p.id,
            "start_date": p.start_date.isoformat(),
        }
        for p in plans
    ]


@router.get("/meal-plan/history/{plan_id}")
def meal_plan_detail(
    plan_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    plan = db.scalar(
        select(MealPlan).where(
            MealPlan.id == plan_id,
            MealPlan.user_id == user.id,
        )
    )
    if not plan:
        raise HTTPException(404, "Plan not found.")

    return plan_response(db, plan)


@router.post("/meal-plan/generate")
def create_meal_plan(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    plan = generate_plan(db, user.id)
    return plan_response(db, plan)


@router.patch("/meal-plan/items/{item_id}")
def update_plan_item(
    item_id: int,
    payload: PlanItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    item = own_plan_item(db, user.id, item_id)

    if payload.eaten and not item.eaten:
        log = FoodLog(
            user_id=user.id,
            food_id=item.food_id,
            date=item.date,
            meal_type=item.meal_type,
            grams=item.grams,
        )
        db.add(log)
        db.flush()
        item.food_log_id = log.id

    elif not payload.eaten and item.eaten:
        if item.food_log_id:
            log = own_log(
                db, user.id, item.food_log_id
            )
            db.delete(log)
        item.food_log_id = None

    item.eaten = payload.eaten
    db.commit()

    return {"id": item.id, "eaten": item.eaten}


@router.post("/meal-plan/items/{item_id}/swap")
def swap_plan_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    item = own_plan_item(db, user.id, item_id)

    if item.eaten:
        raise HTTPException(
            409, "Uncheck I Ate This before swapping."
        )

    profile = db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == user.id
        )
    )

    if not profile or requires_dietary_review(profile):
        raise HTTPException(
            422, "Individual dietary review is required."
        )

    current = db.get(Food, item.food_id)
    if not current:
        raise HTTPException(404, "Food not found.")

    used_ids = db.scalars(
        select(MealPlanItem.food_id).where(
            MealPlanItem.plan_id == item.plan_id,
            MealPlanItem.date == item.date,
        )
    ).all()

    candidates = db.scalars(
        select(Food).where(
            Food.category == current.category,
            Food.id != current.id,
            Food.verified.is_(True),
        ).order_by(Food.id)
    ).all()

    candidate = next(
        (f for f in candidates if f.id not in used_ids),
        None
    )

    if not candidate:
        raise HTTPException(
            422, "No reviewed alternative available."
        )

    item.food_id = candidate.id
    db.commit()
    return {"message": "Meal swapped."}


@router.get("/anaemia")
def anaemia_status(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    profile = db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == user.id
        )
    )

    records = db.scalars(
        select(HbRecord).where(
            HbRecord.user_id == user.id
        ).order_by(HbRecord.date.desc(), HbRecord.id.desc())
    ).all()

    foods = db.scalars(
        select(Food).where(
            Food.verified.is_(True)
        ).order_by(Food.iron.desc()).limit(8)
    ).all()

    return {
        "anaemia_history": profile.anaemia if profile else None,
        "iron_prescribed": (
            profile.iron_prescribed if profile else None
        ),
        "hb_records": [
            {
                "id": r.id,
                "value": r.value,
                "date": r.date.isoformat(),
            }
            for r in records
        ],
        "iron_foods": [serialize_food(f) for f in foods],
        "disclaimer": (
            "Hb results need professional interpretation. "
            "Do not change treatment based on this app."
        ),
    }


@router.post("/anaemia/hb", status_code=201)
def save_hb(
    payload: HbCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    day = payload.date or today()

    if day > today():
        raise HTTPException(
            422, "Future dates are not allowed."
        )

    row = HbRecord(
        user_id=user.id,
        value=payload.value,
        date=day,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {"id": row.id, "message": "Hb result recorded."}


@router.delete("/anaemia/hb/{record_id}")
def delete_hb(
    record_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    row = db.scalar(
        select(HbRecord).where(
            HbRecord.id == record_id,
            HbRecord.user_id == user.id,
        )
    )

    if not row:
        raise HTTPException(404, "Hb record not found.")

    db.delete(row)
    db.commit()
    return {"message": "Hb record deleted."}


@router.get("/gdm")
def gdm_status(
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    profile = db.scalar(
        select(MotherProfile).where(
            MotherProfile.user_id == user.id
        )
    )

    if not profile:
        raise HTTPException(404, "Profile not found.")

    weeks = None
    if profile.baby_birth_date:
        weeks = max(
            0,
            (today() - profile.baby_birth_date).days // 7
        )

    return {
        "gdm_history": profile.gdm_history,
        "test_status": profile.gdm_test_status,
        "result": profile.gdm_result,
        "postpartum_week": weeks,
        "guidance": (
            "If you had gestational diabetes, discuss "
            "postpartum glucose testing and ongoing "
            "follow-up with your healthcare professional."
        ),
    }


SCAN_FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


def clean_scan_image(data, mime):
    expected = SCAN_FORMATS[mime]
    try:
        with Image.open(BytesIO(data)) as source:
            if source.format != expected or source.width * source.height > 16_000_000:
                raise ValueError("Missing or unsupported image format or dimensions")
            with ImageOps.exif_transpose(source).convert("RGB") as pixels:
                # The provider receives pixels and format only. Drop EXIF, GPS and text.
                pixels.info.clear()
                with BytesIO() as output:
                    pixels.save(output, format=expected)
                    cleaned = output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "Invalid image file.") from None
    if len(cleaned) > 5 * 1024 * 1024:
        raise HTTPException(413, "Maximum prepared image size is 5 MB.")
    return cleaned


@router.post("/scan")
async def scan_meal(
    file: UploadFile = File(...),
    idempotency_key: str | None = Header(default=None),
    user: User = Depends(require_mother),
    db: Session = Depends(get_db),
):
    if file.content_type not in SCAN_FORMATS:
        raise HTTPException(
            415, "Upload a JPG, PNG or WebP image."
        )

    data = await file.read(5 * 1024 * 1024 + 1)

    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(
            413, "Maximum image size is 5 MB."
        )

    data = await run_in_threadpool(clean_scan_image, data, file.content_type)

    charge = free_quota.begin_request(db, user.id, "scan", idempotency_key)
    result = await scan_food(data, file.content_type, db=db, user_id=user.id, entitlement_quota=charge is not None)
    track = analytics.ready(db)
    matched = match_scanned_foods(db, result, commit=charge is None and not track)
    if charge is not None:
        charge.record_success(db)
    if track:
        analytics.record(db, user.id, "scan")
    if charge is not None or track:
        db.commit()
    return matched

class ScanReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    receipt: str = Field(min_length=10, max_length=2000)
    corrected: bool = Field(strict=True)


@router.post("/scan/review")
def review_scan(body: ScanReview, db: Session = Depends(get_db), user: User = Depends(require_mother)):
    monitor.record_correction(db, body.receipt, user.id, body.corrected)
    return {"message":"Scan review recorded."}
