from app.services import clinical_review as clinical
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import delete, func, inspect, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import get_admin_permissions, require_admin_permission
from app.models.admin import AdminUser
from app.models.media import MediaFile
from app.models.nutrition import Food, MEAL_EDITORIAL_COLUMNS, MealIdea, MealIdeaIngredient, meal_idea_columns
from app.services.admin_audit import record_admin_audit
from app.services.admin_crud import AdminCRUD
from app.services.nutrition_service import nutrients

router = APIRouter(prefix="/api/admin/meal-ideas", tags=["Admin - Meal Ideas"])
Db = Annotated[Session, Depends(get_db)]
Reader = Annotated[AdminUser, Depends(require_admin_permission("content.view"))]
Creator = Annotated[AdminUser, Depends(require_admin_permission("content.create"))]
Editor = Annotated[AdminUser, Depends(require_admin_permission("content.edit"))]
Archiver = Annotated[AdminUser, Depends(require_admin_permission("content.delete"))]
Slot = Literal["breakfast", "morning_snack", "lunch", "evening_snack", "dinner"]
Status = Literal["draft", "in_review", "archived", "legacy", "published"]
Tag = Literal["iron_rich", "low_gi", "vegetarian", "vegan", "pescatarian"]
Allergen = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class Ingredient(BaseModel):
    model_config = ConfigDict(extra="forbid")
    food_id: int = Field(ge=1, le=2147483647, strict=True)
    grams: Decimal = Field(gt=0, max_digits=10, decimal_places=2, allow_inf_nan=False)


class IngredientList(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ingredients: list[Ingredient] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def distinct_foods(self):
        if len({entry.food_id for entry in self.ingredients}) != len(self.ingredients):
            raise ValueError("Use each food only once.")
        return self


class MealDraft(IngredientList):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=150)
    title_ta: str | None = Field(default=None, max_length=150)
    description: str = Field(default="", max_length=15000)
    description_ta: str | None = Field(default=None, max_length=15000)
    category: Slot
    tags: list[Tag] = Field(default_factory=list, max_length=5)
    allergens: list[Allergen] = Field(default_factory=list, max_length=50)
    photo_media_id: int | None = Field(default=None, ge=1, le=2147483647, strict=True)


def migrated_db(db: Db):
    if not MEAL_EDITORIAL_COLUMNS.issubset(meal_idea_columns(db)) or not inspect(db.connection()).has_table("meal_idea_ingredients"):
        raise HTTPException(status_code=503, detail="Meal Ideas management is awaiting its database migration.")
    return db


AdminDb = Annotated[Session, Depends(migrated_db)]


def selected_foods(db, ingredients):
    ids = [entry.food_id for entry in ingredients]
    foods = {food.id: food for food in db.scalars(select(Food).where(Food.id.in_(ids)))} if ids else {}
    if len(foods) != len(ids):
        raise HTTPException(status_code=422, detail="Select existing foods for all ingredients.")
    return foods


def calculate(ingredients, foods):
    values = [nutrients(foods[entry.food_id], float(entry.grams)) for entry in ingredients]
    unavailable = [entry.food_id for entry, value in zip(ingredients, values) if value is None]
    if not values or unavailable:
        return {"totals": None, "unverified_food_ids": unavailable}
    return {
        "totals": {
            key: round(sum(value[key] for value in values), 2 if key == "iron" else 1)
            for key in values[0]
        },
        "unverified_food_ids": [],
    }


def check_photo(db, id):
    photo = db.get(MediaFile, id)
    if not photo or photo.status != "active" or photo.media_type != "image":
        raise HTTPException(status_code=422, detail="Select an active image from the Media Library.")


class MealCRUD(AdminCRUD):
    def ingredient_rows(self, db, id):
        return list(db.execute(
            select(MealIdeaIngredient, Food).join(Food, Food.id == MealIdeaIngredient.food_id)
            .where(MealIdeaIngredient.meal_idea_id == id).order_by(MealIdeaIngredient.food_id)
        ))

    def detail(self, db, row):
        ingredients = self.ingredient_rows(db, row.id)
        return {
            **self._snapshot(row), "status": row.editorial_status or "legacy",
            "food_ingredients": [
                {"food_id": entry.food_id, "grams": float(entry.grams), "name_en": food.name_en,
                 "name_ta": food.name_ta, "verified": food.verified}
                for entry, food in ingredients
            ],
            **calculate([entry for entry, _ in ingredients], {food.id: food for _, food in ingredients}),
        }

    def save(self, db, draft, admin, request, id=None):
        try:
            selected_foods(db, draft.ingredients)
            values = draft.model_dump(exclude={"ingredients", "photo_media_id"})
            values["tags"] = list(dict.fromkeys(values["tags"]))
            values["allergens"] = list(dict.fromkeys(values["allergens"]))
            if "photo_media_id" in draft.model_fields_set:
                if "media.view" not in get_admin_permissions(admin):
                    raise HTTPException(status_code=403, detail="Media access is required to change the photo.")
                if draft.photo_media_id is not None:
                    check_photo(db, draft.photo_media_id)
                values["photo_media_id"] = draft.photo_media_id

            before = None
            if id is None:
                row = MealIdea(editorial_status="draft", created_by=admin.id, created_at=func.now())
                db.add(row)
            else:
                row = self.locked(db, id)
                if row.editorial_status != "draft":
                    raise HTTPException(status_code=409, detail="Only drafts can be edited.")
                before = self.detail(db, row)

            for field, value in values.items():
                setattr(row, field, value)
            row.updated_by = admin.id
            row.updated_at = func.now()
            db.flush()
            # Ingredient replacement and its audit entry share the meal transaction.
            if id is not None:
                db.execute(delete(MealIdeaIngredient).where(MealIdeaIngredient.meal_idea_id == row.id))
            db.add_all([MealIdeaIngredient(meal_idea_id=row.id, food_id=entry.food_id, grams=entry.grams)
                        for entry in draft.ingredients])
            db.flush()
            return self.finish(db, row, before, admin.id, request, "created" if id is None else "updated")
        except Exception:
            db.rollback()
            raise

    def locked(self, db, id):
        row = db.scalar(select(MealIdea).where(MealIdea.id == id).with_for_update())
        if row is None:
            raise HTTPException(status_code=404, detail="Meal idea not found.")
        return row

    def transition(self, db, id, admin_id, request, destination):
        sources = {"in_review": ("draft",), "archived": ("draft", "in_review")}
        try:
            row = self.locked(db, id)
            if row.editorial_status not in sources[destination]:
                raise HTTPException(status_code=409, detail="This meal idea cannot make that transition.")
            before = self.detail(db, row)
            if destination == "in_review":
                english_prep = bool(row.description.strip())
                tamil_prep = bool((row.description_ta or "").strip())
                if not (row.title_ta or "").strip() or english_prep != tamil_prep:
                    raise HTTPException(status_code=422, detail="Complete both titles and provide any preparation text in both languages before submitting.")
                if not before["food_ingredients"]:
                    raise HTTPException(status_code=422, detail="Add at least one catalog ingredient before submitting.")
                if row.photo_media_id is not None:
                    check_photo(db, row.photo_media_id)
            row.editorial_status = destination
            row.updated_by = admin_id
            row.updated_at = func.now()
            db.flush()
            action = "submitted_for_review" if destination == "in_review" else "archived"
            db.flush()
            if destination == "in_review":
                clinical.submit(db, "meal_ideas", id, admin_id)
            else:
                clinical.supersede(db, "meal_ideas", id)
            return self.finish(db, row, before, admin_id, request, action)
        except Exception:
            db.rollback()
            raise

    def finish(self, db, row, before, admin_id, request, action):
        after = self.detail(db, row)
        record_admin_audit(db, admin_id=admin_id, entity="meal_ideas", entity_id=row.id,
                           action=f"meal_ideas.{action}", before=before, after=after, request=request)
        db.commit()
        return after


crud = MealCRUD(
    MealIdea, "meal_ideas", create_fields=set(), update_fields=set(),
    search_fields={"title", "title_ta", "description", "description_ta"}, filter_fields={"category"},
    archive_field="editorial_status",
)


@router.get("")
def list_meals(
    admin: Reader, db: AdminDb, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
    search: str = Query("", max_length=200), category: str | None = Query(None, max_length=40),
    status: Status | None = None, tamil: Literal["missing", "complete"] | None = None,
):
    conditions = []
    if status == "legacy":
        conditions.append(MealIdea.editorial_status.is_(None))
    elif status is not None:
        conditions.append(MealIdea.editorial_status == status)
    if tamil:
        missing = or_(
            func.coalesce(func.trim(MealIdea.title_ta), "") == "",
            (func.trim(MealIdea.description) != "") & (func.coalesce(func.trim(MealIdea.description_ta), "") == ""),
        )
        conditions.append(missing if tamil == "missing" else ~missing)
    result = crud.list_records(db, page=page, page_size=page_size, search=search,
                               filters={"category": category}, extra_conditions=tuple(conditions))
    summary = ("id", "title", "title_ta", "category")
    result["items"] = [{**{key: row[key] for key in summary}, "status": row["editorial_status"] or "legacy"}
                       for row in result["items"]]
    result["categories"] = list(db.scalars(select(MealIdea.category).distinct().order_by(MealIdea.category)))
    return result


@router.get("/foods")
def search_foods(admin: Reader, db: AdminDb, search: str = Query("", max_length=150)):
    term = f"%{search.strip()}%"
    foods = db.scalars(select(Food).where(or_(Food.name_en.ilike(term), Food.name_ta.ilike(term)))
                       .order_by(Food.name_en, Food.id).limit(25))
    return [{"id": food.id, "name_en": food.name_en, "name_ta": food.name_ta, "verified": food.verified} for food in foods]


@router.post("/nutrients")
def preview_nutrients(draft: IngredientList, admin: Reader, db: AdminDb):
    return calculate(draft.ingredients, selected_foods(db, draft.ingredients))


@router.get("/{id}")
def get_meal(id: int, admin: Reader, db: AdminDb):
    return crud.detail(db, crud._get_or_404(db, id))


@router.post("", status_code=201)
def create_meal(draft: MealDraft, request: Request, admin: Creator, db: AdminDb):
    return crud.save(db, draft, admin, request)


@router.put("/{id}")
def update_meal(id: int, draft: MealDraft, request: Request, admin: Editor, db: AdminDb):
    return crud.save(db, draft, admin, request, id)


@router.post("/{id}/submit")
def submit_meal(id: int, request: Request, admin: Editor, db: AdminDb):
    return crud.transition(db, id, admin.id, request, "in_review")


@router.delete("/{id}")
def archive_meal(id: int, request: Request, admin: Archiver, db: AdminDb):
    return crud.transition(db, id, admin.id, request, "archived")
