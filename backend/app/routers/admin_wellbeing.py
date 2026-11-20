from app.services import clinical_review as clinical
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import get_admin_permissions, require_admin_permission
from app.models.admin import AdminUser
from app.models.media import MediaFile
from app.models.wellbeing import EDITORIAL_COLUMNS, WellbeingActivity, wellbeing_activity_columns
from app.services.admin_audit import record_admin_audit
from app.services.admin_crud import AdminCRUD

router = APIRouter(prefix="/api/admin/wellbeing-activities", tags=["Admin - Wellbeing Activities"])
Db = Annotated[Session, Depends(get_db)]
Reader = Annotated[AdminUser, Depends(require_admin_permission("content.view"))]
Creator = Annotated[AdminUser, Depends(require_admin_permission("content.create"))]
Editor = Annotated[AdminUser, Depends(require_admin_permission("content.edit"))]
Archiver = Annotated[AdminUser, Depends(require_admin_permission("content.delete"))]
Status = Literal["draft", "in_review", "archived", "legacy", "published"]
ActivityType = Literal["meditation", "breathing", "sleep", "gratitude"]
Step = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class ActivityDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=120)
    title_ta: str | None = Field(default=None, max_length=120)
    activity_type: ActivityType
    duration_minutes: int = Field(ge=1, le=1440, strict=True)
    steps: list[Step] = Field(default_factory=list, max_length=50)
    steps_ta: list[Step] | None = Field(default=None, max_length=50)
    audio_media_id: int | None = Field(default=None, ge=1, le=2147483647)
    is_premium: bool = False

    @model_validator(mode="after")
    def validate_paired_steps(self):
        if self.steps_ta is None:
            self.steps_ta = [""] * len(self.steps)
        if len(self.steps) != len(self.steps_ta):
            raise ValueError("English and Tamil steps must be saved in paired rows.")
        return self


def migrated_db(db: Db):
    if not EDITORIAL_COLUMNS.issubset(wellbeing_activity_columns(db)):
        raise HTTPException(status_code=503, detail="Wellbeing management is awaiting its database migration.")
    return db


AdminDb = Annotated[Session, Depends(migrated_db)]


class ActivityCRUD(AdminCRUD):
    def transition(
        self, db: Session, activity_id: int, admin_id: int,
        destination: Literal["in_review", "archived"], request: Request,
    ):
        allowed = {"in_review": ("draft",), "archived": ("draft", "in_review")}
        try:
            activity = db.scalar(
                select(WellbeingActivity).where(WellbeingActivity.id == activity_id).with_for_update()
            )
            if activity is None:
                raise HTTPException(status_code=404, detail="Activity not found.")
            if activity.editorial_status not in allowed[destination]:
                raise HTTPException(status_code=409, detail="This activity cannot make that transition.")
            if destination == "in_review":
                en, ta = activity.steps, activity.steps_ta or []
                if not (
                    activity.title.strip() and (activity.title_ta or "").strip()
                    and en and len(en) == len(ta) and all(step.strip() for step in en + ta)
                ):
                    raise HTTPException(
                        status_code=422,
                        detail="Complete the English and Tamil titles and all paired steps before submitting.",
                    )
                if activity.audio_media_id is not None:
                    active_audio(db, activity.audio_media_id)

            before = self._snapshot(activity)
            activity.editorial_status = destination
            activity.updated_by = admin_id
            activity.updated_at = func.now()
            db.flush()
            after = self._snapshot(activity)
            record_admin_audit(
                db, admin_id=admin_id, entity="wellbeing_activities", entity_id=activity_id,
                action="wellbeing_activities.submitted_for_review" if destination == "in_review"
                else "wellbeing_activities.archived",
                before=before, after=after, request=request,
            )
            if destination == "in_review":
                clinical.submit(db, "wellbeing_activities", activity_id, admin_id)
            else:
                clinical.supersede(db, "wellbeing_activities", activity_id)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return after


fields = set(ActivityDraft.model_fields)
crud = ActivityCRUD(
    WellbeingActivity, "wellbeing_activities",
    create_fields=fields, update_fields=fields, search_fields={"title", "title_ta"},
    filter_fields={"activity_type"}, archive_field="editorial_status",
    status_field="editorial_status", draft_only_updates=True, allow_legacy_draft_updates=False,
    track_write_timestamps=True,
)


def active_audio(db: Session, media_id: int):
    media = db.get(MediaFile, media_id)
    if media is None or media.status != "active" or media.media_type != "audio":
        raise HTTPException(status_code=422, detail="Select an active audio file from the Media Library.")


def activity_payload(draft: ActivityDraft, db: Session, admin: AdminUser):
    payload = draft.model_dump(exclude={"audio_media_id"})
    if "audio_media_id" in draft.model_fields_set:
        if "media.view" not in get_admin_permissions(admin):
            raise HTTPException(status_code=403, detail="Media access is required to change the audio.")
        if draft.audio_media_id is not None:
            active_audio(db, draft.audio_media_id)
        payload["audio_media_id"] = draft.audio_media_id
    return payload


def activity_result(record):
    return {**record, "status": record["editorial_status"] or "legacy"}


@router.get("")
def list_activities(
    admin: Reader, db: AdminDb,
    page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
    search: str = Query("", max_length=200), activity_type: ActivityType | None = None,
    status: Status | None = None, tamil: Literal["missing", "complete"] | None = None,
):
    activity = WellbeingActivity
    conditions = []
    if status == "legacy":
        conditions.append(activity.editorial_status.is_(None))
    elif status is not None:
        conditions.append(activity.editorial_status == status)
    if tamil:
        missing = or_(
            func.coalesce(func.trim(activity.title_ta), "") == "",
            func.coalesce(func.json_length(activity.steps_ta), 0) == 0,
            func.json_length(activity.steps_ta) != func.json_length(activity.steps),
            func.coalesce(func.json_contains(activity.steps_ta, '""'), 0) == 1,
        )
        conditions.append(missing if tamil == "missing" else ~missing)
    result = crud.list_records(
        db, page=page, page_size=page_size, search=search,
        filters={"activity_type": activity_type}, extra_conditions=tuple(conditions),
    )
    summary = ("id", "title", "title_ta", "activity_type", "duration_minutes", "status")
    result["items"] = [{key: row[key] for key in summary} for row in map(activity_result, result["items"])]
    return result


@router.get("/{activity_id}")
def get_activity(activity_id: int, admin: Reader, db: AdminDb):
    return activity_result(crud.get_record(db, activity_id))


@router.post("", status_code=201)
def create_activity(draft: ActivityDraft, request: Request, admin: Creator, db: AdminDb):
    return activity_result(crud.create_record(
        db, admin_id=admin.id, payload=activity_payload(draft, db, admin), request=request,
    ))


@router.put("/{activity_id}")
def update_activity(activity_id: int, draft: ActivityDraft, request: Request, admin: Editor, db: AdminDb):
    return activity_result(crud.update_record(
        db, activity_id, admin_id=admin.id, payload=activity_payload(draft, db, admin), request=request,
    ))


@router.post("/{activity_id}/submit")
def submit_activity(activity_id: int, request: Request, admin: Editor, db: AdminDb):
    return activity_result(crud.transition(db, activity_id, admin.id, "in_review", request))


@router.delete("/{activity_id}")
def archive_activity(activity_id: int, request: Request, admin: Archiver, db: AdminDb):
    return activity_result(crud.transition(db, activity_id, admin.id, "archived", request))
