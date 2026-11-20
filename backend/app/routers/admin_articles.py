from app.services import clinical_review as clinical
import re
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import get_admin_permissions, require_admin_permission
from app.models.admin import AdminUser
from app.models.article import Article
from app.models.media import MediaFile
from app.schemas.article import Category
from app.services.admin_crud import AdminCRUD
from app.services.admin_audit import record_admin_audit


router = APIRouter(prefix="/api/admin/articles", tags=["Admin - Articles"])
Db = Annotated[Session, Depends(get_db)]
Reader = Annotated[AdminUser, Depends(require_admin_permission("content.view"))]
Creator = Annotated[AdminUser, Depends(require_admin_permission("content.create"))]
Editor = Annotated[AdminUser, Depends(require_admin_permission("content.edit"))]
Archiver = Annotated[AdminUser, Depends(require_admin_permission("content.delete"))]
ArticleStatus = Literal["draft", "in_review", "archived", "published"]

MEDIA_PATH = re.compile(r"/api/admin/media/([1-9][0-9]{0,9})/file")
Point = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class ArticleDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title_en: str = Field(min_length=1, max_length=250)
    title_ta: str = Field(default="", max_length=250)
    body_en: str = Field(default="", max_length=15000)
    body_ta: str = Field(default="", max_length=15000)
    category: Category
    read_time: int = Field(default=4, ge=1, le=1440)
    min_week: int | None = Field(default=None, ge=0, le=520)
    max_week: int | None = Field(default=None, ge=0, le=520)
    delivery_type: Literal["any", "vaginal", "csection"] = "any"
    safety_label: Literal["helpful", "care", "not_recommended"] | None = None
    key_points_en: list[Point] = Field(default_factory=list, max_length=50)
    key_points_ta: list[Point] = Field(default_factory=list, max_length=50)
    doctor_note_en: str | None = Field(default=None, max_length=15000)
    doctor_note_ta: str | None = Field(default=None, max_length=15000)
    first_baby_only: bool = False
    is_premium: bool = False
    image_media_id: int | None = Field(default=None, ge=1, le=2147483647)

    @model_validator(mode="after")
    def validate_weeks(self):
        if self.min_week is not None and self.max_week is not None:
            if self.min_week > self.max_week:
                raise ValueError("Minimum week cannot exceed maximum week.")
        return self


class ArticleCRUD(AdminCRUD):
    def transition(
        self, db: Session, article_id: int, *, admin_id: int,
        destination: Literal["in_review", "archived"], request: Request,
    ):
        try:
            article = db.scalar(select(Article).where(Article.id == article_id).with_for_update())
            if article is None:
                raise HTTPException(status_code=404, detail="Article not found.")

            sources = {
                "in_review": (None, "draft"),
                "archived": (None, "draft", "in_review"),
            }
            if article.published or article.editorial_status not in sources[destination]:
                raise HTTPException(status_code=409, detail="This article cannot make that transition.")
            if destination == "in_review" and not all(
                text.strip() for text in (article.title_en, article.title_ta, article.body_en, article.body_ta)
            ):
                raise HTTPException(status_code=422, detail="Add English and Tamil titles and bodies before submitting.")

            before = self._snapshot(article)
            article.editorial_status = destination
            article.updated_by = admin_id
            db.flush()
            after = self._snapshot(article)
            record_admin_audit(
                db, admin_id=admin_id, entity="articles", entity_id=article_id,
                action="articles.submitted_for_review" if destination == "in_review" else "articles.archived",
                before=before, after=after, request=request,
            )
            if destination == "in_review":
                clinical.submit(db, "articles", article_id, admin_id)
            else:
                clinical.supersede(db, "articles", article_id)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return after


editable_fields = set(ArticleDraft.model_fields) | {"image_url"}
crud = ArticleCRUD(
    Article,
    "articles",
    create_fields=editable_fields | {"slug"},
    update_fields=editable_fields,
    search_fields={"title_en", "title_ta", "body_en", "body_ta", "slug"},
    filter_fields={"category", "published"},
    archive_field="editorial_status",
    status_field="editorial_status",
    draft_only_updates=True,
    protect_published_updates=True,
)


def draft_payload(draft: ArticleDraft, db: Session, admin: AdminUser):
    data = draft.model_dump(exclude={"image_media_id"})
    if "image_media_id" not in draft.model_fields_set:
        return data

    if "media.view" not in get_admin_permissions(admin):
        raise HTTPException(status_code=403, detail="Media access is required to change the image.")

    media_id = draft.image_media_id
    if media_id is None:
        return {**data, "image_url": None, "image_media_id": None}

    media = db.get(MediaFile, media_id)
    if media is None or media.status != "active" or media.media_type != "image":
        raise HTTPException(status_code=422, detail="Select an active image from the Media Library.")

    return {**data, "image_url": None, "image_media_id": media.id}


def article_result(record):
    path = record.pop("image_url")
    legacy_media = MEDIA_PATH.fullmatch(path or "")
    media_id = record["image_media_id"]
    if media_id is None and legacy_media:
        media_id = int(legacy_media[1])
    return {
        **record,
        "image_media_id": media_id,
        "image_url": None if legacy_media else path,
        "status": record["editorial_status"] or ("published" if record["published"] else "draft"),
    }


@router.get("")
def list_articles(
    db: Db,
    admin: Reader,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query("", max_length=200),
    category: Category | None = None,
    status: ArticleStatus | None = None,
    tamil: Literal["missing", "complete"] | None = None,
):
    missing = or_(func.trim(Article.title_ta) == "", func.trim(Article.body_ta) == "")
    conditions = []
    if tamil is not None:
        conditions.append(missing if tamil == "missing" else ~missing)
    if status == "published":
        conditions.append(Article.publicly_visible)
    elif status == "draft":
        conditions.append(
            or_(Article.editorial_status == "draft",
                Article.editorial_status.is_(None) & Article.published.is_(False))
        )
    elif status is not None:
        conditions.append(Article.editorial_status == status)
    result = crud.list_records(
        db,
        page=page,
        page_size=page_size,
        search=search,
        filters={"category": category},
        extra_conditions=tuple(conditions),
    )
    summary_fields = ("id", "title_en", "title_ta", "category", "updated_at", "status")
    result["items"] = [
        {key: item[key] for key in summary_fields}
        for item in map(article_result, result["items"])
    ]
    return result


@router.get("/{article_id}")
def get_article(article_id: int, db: Db, admin: Reader):
    return article_result(crud.get_record(db, article_id))


@router.post("", status_code=201)
def create_article(draft: ArticleDraft, request: Request, db: Db, admin: Creator):
    data = draft_payload(draft, db, admin)
    name = re.sub(r"[^a-z0-9]+", "-", draft.title_en.lower()).strip("-")[:140].rstrip("-")
    data["slug"] = f"{name or 'article'}-{uuid4().hex}"
    return article_result(crud.create_record(db, admin_id=admin.id, payload=data, request=request))


@router.put("/{article_id}")
def update_article(article_id: int, draft: ArticleDraft, request: Request, db: Db, admin: Editor):
    data = draft_payload(draft, db, admin)
    return article_result(
        crud.update_record(db, article_id, admin_id=admin.id, payload=data, request=request)
    )


@router.post("/{article_id}/submit")
def submit_article(article_id: int, request: Request, db: Db, admin: Editor):
    return article_result(crud.transition(db, article_id, admin_id=admin.id, destination="in_review", request=request))


@router.delete("/{article_id}")
def archive_article(article_id: int, request: Request, db: Db, admin: Archiver):
    return article_result(crud.transition(db, article_id, admin_id=admin.id, destination="archived", request=request))
