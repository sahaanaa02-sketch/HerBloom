from app.services import clinical_review as clinical
import csv
import io
import math
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError
from sqlalchemy import func, inspect, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, undefer_group

from app.config import external_setting
from app.database import get_db
from app.dependencies.admin_auth import require_admin_permission
from app.models.admin import AdminUser
from app.models.nutrition import FavoriteFood, Food, FoodAlias, NutritionTarget, NutritionTargetValue, UnmatchedFoodName
from app.services.admin_audit import record_admin_audit
from app.services.food_matching import food_key

router = APIRouter(prefix="/api/admin", tags=["Admin - Nutrition Data"])
Db = Annotated[Session, Depends(get_db)]
Reader = Annotated[AdminUser, Depends(require_admin_permission("nutrition.view"))]
Creator = Annotated[AdminUser, Depends(require_admin_permission("nutrition.create"))]
Editor = Annotated[AdminUser, Depends(require_admin_permission("nutrition.edit"))]
Remover = Annotated[AdminUser, Depends(require_admin_permission("nutrition.delete"))]
Reviewer = Annotated[AdminUser, Depends(require_admin_permission("nutrition.approve"))]
PRIMARY = ("calories", "protein", "iron", "calcium")
UNITS = {"calories":"kcal", "protein":"g", "carbs_g":"g", "fat_g":"g", "fibre_g":"g",
         "iron":"mg", "calcium":"mg", "folate_ug":"ug", "vitamin_c_mg":"mg"}
FIELDS = tuple(UNITS)
EXTRAS = ("source_ref", "carbs_g", "fat_g", "fibre_g", "folate_ug", "vitamin_c_mg", "tags", "missing_nutrients")
Nutrient = Literal["calories","protein","carbs_g","fat_g","fibre_g","iron","calcium","folate_ug","vitamin_c_mg"]
Group = Literal["breastfeeding", "not_breastfeeding"]
Amount = Annotated[float, Field(ge=0, le=1e9, allow_inf_nan=False)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=70)]
CSV_FIELDS = ("name_en", "name_ta", "category", "source", "source_ref", *FIELDS, "tags")


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class FoodLabels(Payload):
    name_ta: str | None = Field(default=None, max_length=150)
    tags: list[Label] = Field(default_factory=list, max_length=20)


class FoodDraft(FoodLabels):
    name_en: str = Field(min_length=1, max_length=150)
    category: str = Field(default="other", min_length=1, max_length=60)
    source: Literal["custom", "sl_fcdb", "usda"] = "custom"
    source_ref: str | None = Field(default=None, max_length=250)
    calories: Amount | None = None
    protein: Amount | None = None
    carbs_g: Amount | None = None
    fat_g: Amount | None = None
    fibre_g: Amount | None = None
    iron: Amount | None = None
    calcium: Amount | None = None
    folate_ug: Amount | None = None
    vitamin_c_mg: Amount | None = None


class AliasDraft(Payload):
    alias: str = Field(min_length=1, max_length=150)
    lang: Literal["en", "ta", "local"]


class MapFood(Payload):
    food_id: int = Field(ge=1, le=2147483647)
    lang: Literal["en", "ta", "local"] = "local"


class USDAImport(Payload):
    fdcId: int = Field(ge=1, le=2147483647, strict=True)


class TargetDraft(Payload):
    feeding_group: Group
    nutrient: Nutrient
    value: float = Field(gt=0, le=1e9, allow_inf_nan=False)
    unit: str = Field(max_length=10)
    source_note: str = Field(min_length=1, max_length=1000)


def migrated_db(db: Db):
    schema = inspect(db.connection())
    if (not set(EXTRAS).issubset({c["name"] for c in schema.get_columns("foods")})
        or "lang" not in {c["name"] for c in schema.get_columns("food_aliases")}
        or not schema.has_table("unmatched_food_names")
        or not schema.has_table("nutrition_target_values")):
        raise HTTPException(503, "Nutrition Data management is awaiting its database migration.")
    return db


AdminDb = Annotated[Session, Depends(migrated_db)]


def row_data(row):
    return {
        field.key: (value.isoformat() if hasattr(value, "isoformat") else value)
        for field in inspect(row).mapper.column_attrs
        if (value := getattr(row, field.key)) is not None
    }


def food_data(food):
    result = row_data(food)
    return {**result, **{key: None for key in (food.missing_nutrients or [])}}


def page_result(db, query, page, size, output=row_data):
    count = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    items = db.scalars(query.offset((page - 1) * size).limit(size))
    return {"items":[output(row) for row in items], "total":count or 0, "page":page, "page_size":size}


def load(db, model, id, *, locked=False):
    query = select(model).where(model.id == id)
    row = db.scalar(query.with_for_update() if locked else query)
    if row is None:
        raise HTTPException(404, "Record not found.")
    return row


def audit(db, admin, request, entity, id, action, before=None, after=None):
    record_admin_audit(db, admin_id=admin.id, request=request, entity=entity, entity_id=id,
                       action=f"{entity}.{action}", before=before, after=after)


def commit(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "The change conflicts with an existing or referenced record.") from None


def flush(db):
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "The change conflicts with an existing or referenced record.") from None


def write_food(db, draft, admin, request, row=None, *, usda=False):
    if draft.source == "usda" and not usda:
        raise HTTPException(422, "Use the USDA import action for USDA foods.")
    if draft.source != "custom" and not draft.source_ref:
        raise HTTPException(422, "Provide a source reference for this food.")
    before = food_data(row) if row is not None else None
    if row is None:
        row = Food(verified=False)
        db.add(row)
    values = draft.model_dump()
    values["source_ref"] = draft.source_ref or None
    values["missing_nutrients"] = [key for key in FIELDS if values[key] is None]
    for key in PRIMARY:
        # Legacy NOT NULL fields retain their existing storage shape. Missing values
        # are never exposed as zero and these drafts are excluded from calculations.
        if values[key] is None:
            values[key] = 0
    for key, value in values.items():
        setattr(row, key, value)
    flush(db)
    after = food_data(row)
    audit(db, admin, request, "foods", row.id, "updated" if before else "created", before, after)
    return after


@router.get("/foods")
def foods(admin: Reader, db: AdminDb, q: str = Query("", max_length=150),
          page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100)):
    term = f"%{q.strip()}%"
    query = select(Food).options(undefer_group("a4")).where(
        or_(Food.name_en.ilike(term), Food.name_ta.ilike(term))).order_by(Food.name_en, Food.id)
    return page_result(db, query, page, page_size, food_data)


@router.get("/foods/{id:int}")
def get_food(id: int, admin: Reader, db: AdminDb):
    food = load(db, Food, id)
    aliases = db.scalars(select(FoodAlias).where(FoodAlias.food_id == id).order_by(FoodAlias.id))
    return {**food_data(food), "aliases": [row_data(alias) for alias in aliases]}


@router.post("/foods", status_code=201)
def add_food(draft: FoodDraft, request: Request, admin: Creator, db: AdminDb):
    result = write_food(db, draft, admin, request)
    commit(db)
    return result


@router.put("/foods/{id:int}")
def edit_food(id: int, draft: FoodDraft | FoodLabels, request: Request, admin: Editor, db: AdminDb):
    row = load(db, Food, id, locked=True)
    if isinstance(draft, FoodDraft):
        if row.verified:
            raise HTTPException(409, "Verified nutrient and source values are protected.")
        if row.source == "usda" and (draft.source != row.source or draft.source_ref != row.source_ref):
            raise HTTPException(409, "A USDA source reference cannot be changed.")
        if row.source == "usda" and any(
            getattr(draft,key) != food_data(row).get(key) for key in FIELDS
        ):
            raise HTTPException(409, "Imported USDA nutrient values are protected.")
        result = write_food(db, draft, admin, request, row, usda=row.source=="usda")
    else:
        before = food_data(row)
        row.name_ta, row.tags = draft.name_ta, draft.tags
        result = food_data(row)
        audit(db, admin, request, "foods", id, "updated", before, result)
    commit(db)
    return result


@router.delete("/foods/{id:int}")
def remove_food(id: int, request: Request, admin: Remover, db: AdminDb):
    row = load(db, Food, id, locked=True)
    if row.verified:
        raise HTTPException(409, "Verified catalog foods cannot be deleted here.")
    if db.scalar(select(FavoriteFood.id).where(FavoriteFood.food_id == id).limit(1)) is not None:
        raise HTTPException(409, "A food saved in favourites cannot be deleted.")
    before = get_food(id, admin, db)
    db.delete(row)
    audit(db, admin, request, "foods", id, "deleted", before)
    commit(db)
    return {"message":"Food deleted."}


def save_alias(db, food_id, draft, admin, request, existing=None):
    key = food_key(draft.alias)
    if not key or len(key) > 150:
        raise HTTPException(422, "Alias is empty or too long after normalization.")
    for id, en, ta in db.execute(select(Food.id, Food.name_en, Food.name_ta)):
        if id != food_id and any(food_key(text) == key for text in (en, ta) if text):
            raise HTTPException(409, "The alias conflicts with a catalog food name.")
    for id, other_food, alias in db.execute(select(FoodAlias.id, FoodAlias.food_id, FoodAlias.alias)):
        if (existing is None or id != existing.id) and food_key(alias) == key:
            raise HTTPException(409, "This alias is already assigned.")
    before = row_data(existing) if existing is not None else None
    row = existing or FoodAlias(food_id=food_id)
    row.alias, row.lang = draft.alias, draft.lang
    if existing is None:
        db.add(row)
    flush(db)
    after = row_data(row)
    audit(db, admin, request, "food_aliases", row.id, "updated" if before else "created", before, after)
    return after


@router.post("/foods/{id:int}/aliases", status_code=201)
def create_alias(id: int, draft: AliasDraft, request: Request, admin: Editor, db: AdminDb):
    load(db, Food, id, locked=True)
    result = save_alias(db, id, draft, admin, request)
    commit(db)
    return result


@router.put("/foods/{id:int}/aliases/{alias_id:int}")
def update_alias(id: int, alias_id: int, draft: AliasDraft, request: Request, admin: Editor, db: AdminDb):
    row = load(db, FoodAlias, alias_id, locked=True)
    if row.food_id != id:
        raise HTTPException(404, "Alias not found for this food.")
    result = save_alias(db, id, draft, admin, request, row)
    commit(db)
    return result


@router.delete("/foods/{id:int}/aliases/{alias_id:int}")
def delete_alias(id: int, alias_id: int, request: Request, admin: Editor, db: AdminDb):
    row = load(db, FoodAlias, alias_id, locked=True)
    if row.food_id != id:
        raise HTTPException(404, "Alias not found for this food.")
    audit(db, admin, request, "food_aliases", alias_id, "deleted", row_data(row))
    db.delete(row)
    commit(db)
    return {"message":"Alias deleted."}


@router.get("/unmatched-foods")
def unmatched(admin: Reader, db: AdminDb, resolved: bool = False,
              page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100)):
    q = select(UnmatchedFoodName).where(UnmatchedFoodName.resolved.is_(resolved)).order_by(
        UnmatchedFoodName.count.desc(), UnmatchedFoodName.last_seen.desc(), UnmatchedFoodName.id)
    return page_result(db, q, page, page_size)


def open_name(db, id):
    row = load(db, UnmatchedFoodName, id, locked=True)
    if row.resolved:
        raise HTTPException(409, "This name has already been resolved.")
    return row


def resolve(db, row, food_id, lang, admin, request):
    existing = db.scalars(select(FoodAlias).where(FoodAlias.food_id == food_id))
    if not any(food_key(a.alias) == food_key(row.name) for a in existing):
        save_alias(db, food_id, AliasDraft(alias=row.name, lang=lang), admin, request)
    before = row_data(row)
    row.resolved = True
    audit(db, admin, request, "unmatched_food_names", row.id, "resolved", before,
          {**row_data(row), "food_id":food_id})
    commit(db)
    return {"id":row.id, "food_id":food_id, "resolved":True}


@router.post("/unmatched-foods/{id}/map")
def map_name(id: int, draft: MapFood, request: Request, admin: Editor, db: AdminDb):
    row = open_name(db, id)
    load(db, Food, draft.food_id, locked=True)
    return resolve(db, row, draft.food_id, draft.lang, admin, request)


@router.post("/unmatched-foods/{id}/create")
def create_from_name(id: int, draft: FoodDraft, request: Request, admin: Creator, db: AdminDb):
    row = open_name(db, id)
    food = write_food(db, draft, admin, request)
    return resolve(db, row, food["id"], "local", admin, request)


@router.get("/nutrition-targets")
def targets(admin: Reader, db: AdminDb):
    rows = db.scalars(select(NutritionTargetValue).order_by(NutritionTargetValue.feeding_group, NutritionTargetValue.nutrient))
    return [row_data(row) for row in rows]


def target_draft(db, draft, admin, request, row=None):
    if draft.unit != UNITS[draft.nutrient]:
        raise HTTPException(422, f"Use {UNITS[draft.nutrient]} for this nutrient.")
    before = row_data(row) if row is not None else None
    if row is not None and row.status != "in_review":
        clinical.supersede(db, "nutrition_target_values", row.id)
    if row is None:
        row = NutritionTargetValue()
        db.add(row)
    elif row.status == "in_review":
        raise HTTPException(409, "Return this proposal to draft before editing.")
    elif (row.feeding_group, row.nutrient) != (draft.feeding_group, draft.nutrient):
        raise HTTPException(422, "A target's group and nutrient cannot be changed.")
    for key, value in draft.model_dump().items():
        setattr(row, key, value)
    row.status, row.reviewed_by = "draft", None
    flush(db)
    after = row_data(row)
    audit(db, admin, request, "nutrition_target_values", row.id, "updated" if before else "created", before, after)
    commit(db)
    return after


@router.post("/nutrition-targets", status_code=201)
def add_target(draft: TargetDraft, request: Request, admin: Creator, db: AdminDb):
    return target_draft(db, draft, admin, request)


@router.put("/nutrition-targets/{id}")
def edit_target(id: int, draft: TargetDraft, request: Request, admin: Editor, db: AdminDb):
    return target_draft(db, draft, admin, request, load(db, NutritionTargetValue, id, locked=True))


def transition_target(db, id, admin, request, source, destination):
    row = load(db, NutritionTargetValue, id, locked=True)
    if row.status != source:
        raise HTTPException(409, "This target cannot make that transition.")
    before = row_data(row)
    row.status = destination
    if destination == "approved":
        row.reviewed_by = admin.id
        if row.nutrient in PRIMARY:
            methods = ("breast","both") if row.feeding_group == "breastfeeding" else ("formula",)
            for method in methods:
                target = db.scalar(select(NutritionTarget).where(NutritionTarget.feeding_method == method).with_for_update())
                if target is None:
                    target = NutritionTarget(feeding_method=method, reviewed=True)
                    db.add(target)
                elif not target.reviewed:
                    # A legacy pending row must not implicitly approve its other values.
                    for field in PRIMARY:
                        setattr(target, field, None)
                    target.reviewed = True
                setattr(target, row.nutrient, row.value)
    db.flush()
    if destination == "in_review":
        clinical.submit(db, "nutrition_target_values", id, admin.id)
    after = row_data(row)
    audit(db, admin, request, "nutrition_target_values", id, destination, before, after)
    commit(db)
    return after


@router.post("/nutrition-targets/{id}/submit")
def submit_target(id: int, request: Request, admin: Editor, db: AdminDb):
    return transition_target(db, id, admin, request, "draft", "in_review")


@router.post("/nutrition-targets/{id}/approve")
def approve_target(id: int, request: Request, admin: Reviewer, db: AdminDb):
    if clinical.ready(db):
        raise HTTPException(409, "Use Clinical Review to decide this submission.")
    return transition_target(db, id, admin, request, "in_review", "approved")


@router.post("/nutrition-targets/{id}/return")
def return_target(id: int, request: Request, admin: Reviewer, db: AdminDb):
    if clinical.ready(db):
        raise HTTPException(409, "Use Clinical Review to decide this submission.")
    return transition_target(db, id, admin, request, "in_review", "draft")


@router.get("/foods/csv-template", response_class=PlainTextResponse)
def template(admin: Reader):
    return PlainTextResponse(",".join(CSV_FIELDS)+"\n", media_type="text/csv",
                             headers={"Content-Disposition":'attachment; filename="herbloom-foods.csv"'})


def validate_csv(data, db):
    reader = csv.DictReader(io.StringIO(data), strict=True)
    if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)) or not {"name_en", "category"}.issubset(reader.fieldnames) or not set(reader.fieldnames).issubset(CSV_FIELDS):
        raise HTTPException(422, "Use the CSV template and include name_en and category.")
    names = {food_key(name) for name in db.scalars(select(Food.name_en))}
    refs = {(src, food_key(ref)) for src, ref in db.execute(select(Food.source, Food.source_ref)) if ref}
    valid, errors = [], []
    for index, row in enumerate(reader, 1):
        if index > 500:
            raise HTTPException(422, "CSV is limited to 500 foods.")
        try:
            if None in row or any(value is None for value in row.values()):
                raise ValueError("The number of fields does not match the header.")
            fields = {key:value.strip() for key,value in row.items() if value.strip()}
            fields["tags"] = [item.strip() for item in fields.get("tags","").split("|") if item.strip()]
            data = FoodDraft.model_validate(fields)
            if not row["category"].strip():
                raise ValueError("Category is required.")
            if data.source == "usda" or (data.source == "sl_fcdb" and not data.source_ref):
                raise ValueError("Use USDA import for USDA foods and provide a Sri Lankan source reference.")
            key = food_key(data.name_en)
            ref = (data.source,food_key(data.source_ref)) if data.source_ref else None
            if key in names or (ref and ref in refs):
                raise ValueError("A food with this name or source reference already exists.")
            names.add(key)
            if ref:
                refs.add(ref)
            valid.append(data)
        except ValidationError as exc:
            errors.append({"line":reader.line_num,"message":"; ".join(
                f"{'.'.join(map(str,e['loc']))}: {e['msg']}" for e in exc.errors(include_input=False)
            )})
        except ValueError as exc:
            errors.append({"line":reader.line_num,"message":str(exc)})
    if not valid and not errors:
        errors.append({"line":1,"message":"Include at least one food row."})
    return valid, errors


@router.post("/foods/csv")
def import_csv(request: Request, admin: Creator, db: AdminDb,
               file: UploadFile = File(...), dry_run: bool = True):
    raw = file.file.read(1024*1024+1)
    if len(raw)>1024*1024:
        raise HTTPException(413, "CSV is limited to 1 MB.")
    try:
        valid, errors = validate_csv(raw.decode("utf-8-sig"), db)
    except (UnicodeError,csv.Error):
        raise HTTPException(422, "Upload a valid UTF-8 CSV file.") from None
    if not errors and not dry_run:
        for draft in valid:
            write_food(db, draft, admin, request)
        commit(db)
    return {"valid_rows":len(valid),"errors":errors,"imported":len(valid) if not dry_run and not errors else 0}


USDA_TYPES = ("Foundation", "SR Legacy", "Survey (FNDDS)", "Branded")
USDA_FIELDS = {1008:"calories", 1003:"protein", 1005:"carbs_g", 1004:"fat_g", 1079:"fibre_g",
               1089:"iron", 1087:"calcium", 1177:"folate_ug", 1162:"vitamin_c_mg"}


def limit_usda(db, admin):
    from app.services import rate_limits
    rate_limits.enforce(db, f"usda:{admin.id}", 30)


async def usda_request(path, params=None):
    key = external_setting("USDA_API_KEY")
    if not key:
        raise HTTPException(503, "USDA FoodData Central is not configured.")
    try:
        async with httpx.AsyncClient(base_url="https://api.nal.usda.gov/fdc/v1", timeout=12,
                                     headers={"X-Api-Key":key}, follow_redirects=False) as client:
            response = await client.get(path, params=params)
    except httpx.HTTPError:
        raise HTTPException(502, "USDA FoodData Central is unavailable.") from None
    if response.status_code == 404:
        raise HTTPException(404, "USDA food was not found.")
    if response.status_code == 429:
        raise HTTPException(503, "USDA FoodData Central rate limit reached.")
    if response.status_code != 200:
        raise HTTPException(502, "USDA FoodData Central could not complete the request.")
    try:
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError
        return data
    except ValueError:
        raise HTTPException(502, "USDA FoodData Central returned an invalid response.") from None


@router.get("/usda/search")
async def usda_search(admin: Reader, db: AdminDb, q: str = Query(min_length=1, max_length=120)):
    if not q.strip():
        raise HTTPException(422, "Enter a food name to search.")
    limit_usda(db, admin)
    payload = await usda_request("foods/search", {"query":q.strip(),"pageSize":15})
    foods = payload.get("foods", [])
    if not isinstance(foods, list):
        raise HTTPException(502, "USDA FoodData Central returned invalid search results.")
    return [{"fdcId":row["fdcId"],"description":row["description"],"dataType":row.get("dataType")}
            for row in foods if isinstance(row,dict) and isinstance(row.get("fdcId"),int)
            and isinstance(row.get("description"),str)]


def usda_draft(data, fdc_id):
    if data.get("fdcId") != fdc_id or data.get("dataType") not in USDA_TYPES or not isinstance(data.get("description"),str):
        raise HTTPException(422, "The USDA result is not a supported food record.")
    description = data["description"].strip()
    nutrients = data.get("foodNutrients", [])
    if not description or not isinstance(nutrients, list):
        raise HTTPException(502, "USDA FoodData Central returned an invalid food record.")
    amounts = {}
    for row in nutrients:
        if not isinstance(row,dict) or not isinstance(nutrient := row.get("nutrient"),dict):
            continue
        key = USDA_FIELDS.get(nutrient.get("id"))
        unit, amount = nutrient.get("unitName"), row.get("amount")
        if key and isinstance(unit,str) and unit.lower()==UNITS[key].lower() and type(amount) in (int,float) and math.isfinite(amount) and 0 <= amount <= 1e9:
            if key in amounts and amounts[key] != amount:
                raise HTTPException(422, "USDA returned conflicting values for one nutrient.")
            amounts[key]=amount
    return FoodDraft(name_en=description[:150], source="usda",source_ref=f"FDC:{fdc_id}",**amounts)


@router.post("/usda/import", status_code=201)
async def import_usda(body: USDAImport, request: Request, admin: Creator, db: AdminDb):
    limit_usda(db, admin)
    payload = await usda_request(f"food/{body.fdcId}")
    result = write_food(db, usda_draft(payload, body.fdcId), admin, request, usda=True)
    commit(db)
    return result
