from app.services import clinical_review as clinical
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin_auth import get_admin_permissions, require_admin_permission
from app.models.admin import AdminUser
from app.models.media import MediaFile
from app.models.recovery import RecoveryExercise
from app.schemas.admin_exercises import ExerciseDraft, youtube_video_id
from app.services.admin_audit import record_admin_audit
from app.services.admin_crud import AdminCRUD


router = APIRouter(prefix="/api/admin/exercises", tags=["Admin - Exercises"])
Db = Annotated[Session, Depends(get_db)]
Reader = Annotated[AdminUser, Depends(require_admin_permission("content.view"))]
Creator = Annotated[AdminUser, Depends(require_admin_permission("content.create"))]
Editor = Annotated[AdminUser, Depends(require_admin_permission("content.edit"))]
Archiver = Annotated[AdminUser, Depends(require_admin_permission("content.delete"))]
ExerciseStatus = Literal["draft", "in_review", "archived", "legacy", "published"]


class ExerciseCRUD(AdminCRUD):
    def transition(
        self, db: Session, exercise_id: int, admin_id: int,
        destination: Literal["in_review", "archived"], request: Request,
    ):
        sources = {"in_review": ("draft",), "archived": ("draft", "in_review")}
        try:
            exercise = db.scalar(
                select(RecoveryExercise).where(RecoveryExercise.id == exercise_id).with_for_update()
            )
            if exercise is None:
                raise HTTPException(status_code=404, detail="Exercise not found.")
            if exercise.editorial_status not in sources[destination]:
                raise HTTPException(status_code=409, detail="This exercise cannot make that transition.")

            if destination == "in_review":
                text_fields = (
                    exercise.name, exercise.name_ta, exercise.safety_notes,
                    exercise.safety_notes_ta, exercise.contraindications, exercise.contraindications_ta,
                )
                en, ta = exercise.steps or [], exercise.steps_ta or []
                if not (
                    all(text and text.strip() for text in text_fields)
                    and en and len(en) == len(ta)
                    and all(step.strip() for step in en + ta)
                ):
                    raise HTTPException(
                        status_code=422,
                        detail="Complete both names, all paired steps, safety notes, and contraindications in English and Tamil before submitting.",
                    )

            before = self._snapshot(exercise)
            exercise.editorial_status = destination
            exercise.updated_by = admin_id
            exercise.updated_at = func.now()
            db.flush()
            after = self._snapshot(exercise)
            record_admin_audit(
                db, admin_id=admin_id, entity="recovery_exercises", entity_id=exercise_id,
                action="recovery_exercises.submitted_for_review" if destination == "in_review"
                else "recovery_exercises.archived",
                before=before, after=after, request=request,
            )
            if destination == "in_review":
                clinical.submit(db, "recovery_exercises", exercise_id, admin_id)
            else:
                clinical.supersede(db, "recovery_exercises", exercise_id)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return after


fields = set(ExerciseDraft.model_fields)
crud = ExerciseCRUD(
    RecoveryExercise, "recovery_exercises",
    create_fields=fields, update_fields=fields,
    search_fields={"name", "name_ta", "equipment"},
    filter_fields={"category"},
    archive_field="editorial_status",
    status_field="editorial_status",
    draft_only_updates=True,
    allow_legacy_draft_updates=False,
    track_write_timestamps=True,
)


def exercise_payload(draft: ExerciseDraft, db: Session, admin: AdminUser):
    payload = draft.model_dump(exclude={"image_media_id"})
    if "image_media_id" not in draft.model_fields_set:
        return payload
    if "media.view" not in get_admin_permissions(admin):
        raise HTTPException(status_code=403, detail="Media access is required to change the image.")
    if draft.image_media_id is not None:
        image = db.get(MediaFile, draft.image_media_id)
        if image is None or image.status != "active" or image.media_type != "image":
            raise HTTPException(status_code=422, detail="Select an active image from the Media Library.")
    return {**payload, "image_media_id": draft.image_media_id}


def exercise_result(record):
    video_id = None
    if record["video_url"]:
        try:
            video_id = youtube_video_id(record["video_url"])
        except ValueError:
            pass  # Older URLs are retained but do not receive a YouTube thumbnail.
    return {**record, "status": record["editorial_status"] or "legacy", "youtube_id": video_id}


@router.get("")
def list_exercises(
    db: Db, admin: Reader,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query("", max_length=200),
    category: str | None = Query(None, max_length=50),
    status: ExerciseStatus | None = None,
    tamil: Literal["missing", "complete"] | None = None,
):
    exercise = RecoveryExercise
    conditions = []
    if status == "legacy":
        conditions.append(exercise.editorial_status.is_(None))
    elif status is not None:
        conditions.append(exercise.editorial_status == status)
    if tamil:
        missing = or_(
            func.coalesce(func.trim(exercise.name_ta), "") == "",
            func.coalesce(func.trim(exercise.safety_notes_ta), "") == "",
            func.coalesce(func.trim(exercise.contraindications_ta), "") == "",
            func.coalesce(func.json_length(exercise.steps_ta), 0) == 0,
            func.json_length(exercise.steps_ta) != func.json_length(exercise.steps),
            func.coalesce(func.json_contains(exercise.steps_ta, '""'), 0) == 1,
        )
        conditions.append(missing if tamil == "missing" else ~missing)
    result = crud.list_records(
        db, page=page, page_size=page_size, search=search,
        filters={"category": category}, extra_conditions=tuple(conditions),
    )
    summary = ("id", "name", "name_ta", "category", "duration_minutes", "updated_at")
    result["items"] = [
        {**{key: row[key] for key in summary}, "status": row["editorial_status"] or "legacy"}
        for row in result["items"]
    ]
    result["categories"] = list(db.scalars(select(exercise.category).distinct().order_by(exercise.category)))
    return result


@router.get("/{exercise_id}")
def get_exercise(exercise_id: int, db: Db, admin: Reader):
    return exercise_result(crud.get_record(db, exercise_id))


def raise_duplicate_name(error: IntegrityError):
    code = getattr(error.orig, "args", (None,))[0]
    if code == 1062 or "UNIQUE constraint failed: recovery_exercises.name" in str(error.orig):
        raise HTTPException(status_code=409, detail="An exercise with that English name already exists.") from error
    raise error


@router.post("", status_code=201)
def create_exercise(draft: ExerciseDraft, request: Request, db: Db, admin: Creator):
    try:
        # AdminCRUD sets the configured status field to draft before its first flush.
        return exercise_result(crud.create_record(
            db, admin_id=admin.id, payload=exercise_payload(draft, db, admin), request=request,
        ))
    except IntegrityError as error:
        raise_duplicate_name(error)


@router.put("/{exercise_id}")
def update_exercise(exercise_id: int, draft: ExerciseDraft, request: Request, db: Db, admin: Editor):
    try:
        return exercise_result(crud.update_record(
            db, exercise_id, admin_id=admin.id, payload=exercise_payload(draft, db, admin), request=request,
        ))
    except IntegrityError as error:
        raise_duplicate_name(error)


@router.post("/{exercise_id}/submit")
def submit_exercise(exercise_id: int, request: Request, db: Db, admin: Editor):
    return exercise_result(crud.transition(db, exercise_id, admin.id, "in_review", request))


@router.delete("/{exercise_id}")
def archive_exercise(exercise_id: int, request: Request, db: Db, admin: Archiver):
    return exercise_result(crud.transition(db, exercise_id, admin.id, "archived", request))
