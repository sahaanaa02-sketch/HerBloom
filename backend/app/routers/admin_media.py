
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import media_storage_dir
from app.database import get_db
from app.dependencies.admin_auth import require_admin_permission
from PIL import Image, UnidentifiedImageError

from app.models.admin import AdminUser
from app.models.media import MediaFile
from app.services.admin_audit import record_admin_audit


# ==========================================
# Admin Media Router
# ==========================================

router = APIRouter(
    prefix="/api/admin/media",
    tags=["Admin - Media"],
)

UPLOAD_DIR = media_storage_dir()

IMAGE_MAX = 2 * 1024 * 1024
AUDIO_MAX = 10 * 1024 * 1024

ALLOWED_TYPES = {
    ".jpg": ("image", "image/jpeg", IMAGE_MAX),
    ".jpeg": ("image", "image/jpeg", IMAGE_MAX),
    ".png": ("image", "image/png", IMAGE_MAX),
    ".webp": ("image", "image/webp", IMAGE_MAX),
    ".mp3": ("audio", "audio/mpeg", AUDIO_MAX),
    ".m4a": ("audio", "audio/mp4", AUDIO_MAX),
}


# ==========================================
# Validate File Signature
# ==========================================

def validate_signature(
    data: bytes,
    extension: str,
) -> bool:

    if extension in {".jpg", ".jpeg"}:
        return data.startswith(b"\xff\xd8\xff")

    if extension == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")

    if extension == ".webp":
        return (
            data.startswith(b"RIFF")
            and data[8:12] == b"WEBP"
        )

    if extension == ".mp3":
        return (
            data.startswith(b"ID3")
            or (
                len(data) >= 2
                and data[0] == 0xFF
                and (data[1] & 0xE0) == 0xE0
            )
        )

    if extension == ".m4a":
        return (
            len(data) >= 12
            and data[4:8] == b"ftyp"
            and data[8:12] in {
                b"M4A ",
                b"M4B ",
                b"isom",
                b"iso2",
                b"mp41",
                b"mp42",
            }
        )

    return False


# ==========================================
# POST - Upload Media
# ==========================================

def valid_image(path, extension):
    expected = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}[extension]
    try:
        with Image.open(path) as image:
            if image.format != expected or image.width * image.height > 16_000_000:
                return False
            image.verify()
        return True
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return False


@router.post("", status_code=201)
async def upload_media(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(
        require_admin_permission("media.upload")
    ),
):
    original_name = Path(
        (file.filename or "").replace("\\", "/")
    ).name

    extension = Path(original_name).suffix.lower()

    if extension not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type.",
        )

    media_type, expected_mime, max_size = (
        ALLOWED_TYPES[extension]
    )

    stored_filename = f"{uuid.uuid4().hex}{extension}"

    file_path = UPLOAD_DIR / stored_filename

    size = 0
    signature = b""

    try:
        UPLOAD_DIR.mkdir(
            parents=True,
            exist_ok=True,
        )

        with file_path.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                size += len(chunk)

                if size > max_size:
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds allowed size.",
                    )

                if len(signature) < 32:
                    signature += chunk[
                        : 32 - len(signature)
                    ]

                output.write(chunk)

        if not validate_signature(
            signature,
            extension,
        ) or (media_type == "image" and not valid_image(file_path, extension)):
            raise HTTPException(
                status_code=415,
                detail="Invalid file content.",
            )

        media = MediaFile(
            original_filename=original_name,
            stored_filename=stored_filename,
            file_path=str(file_path),
            media_type=media_type,
            mime_type=expected_mime,
            file_size=size,
            uploaded_by=admin.id,
            status="active",
        )

        db.add(media)
        db.flush()

        record_admin_audit(
            db,
            admin_id=admin.id,
            action="media.uploaded",
            entity="media",
            entity_id=media.id,
            after={
                "filename": stored_filename,
                "media_type": media_type,
                "file_size": size,
            },
            request=request,
        )

        db.commit()
        db.refresh(media)

        return {
            "id": media.id,
            "original_filename": media.original_filename,
            "media_type": media.media_type,
            "mime_type": media.mime_type,
            "file_size": media.file_size,
            "status": media.status,
        }

    except Exception:
        db.rollback()

        if file_path.exists():
            file_path.unlink()

        raise

    finally:
        await file.close()


# ==========================================
# GET - Media Library List
# ==========================================

@router.get("")
def list_media(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = None,
    media_type: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(
        require_admin_permission("media.view")
    ),
):
    query = db.query(MediaFile)

    if search and search.strip():
        term = f"%{search.strip()}%"

        query = query.filter(
            or_(
                MediaFile.original_filename.ilike(term),
                MediaFile.alt_text_en.ilike(term),
                MediaFile.alt_text_ta.ilike(term),
            )
        )

    if media_type:
        if media_type not in {"image", "audio"}:
            raise HTTPException(
                status_code=422,
                detail="Invalid media type.",
            )

        query = query.filter(
            MediaFile.media_type == media_type
        )

    if status:
        if status not in {"active", "archived"}:
            raise HTTPException(
                status_code=422,
                detail="Invalid media status.",
            )

        query = query.filter(
            MediaFile.status == status
        )

    total = query.count()

    items = (
        query
        .order_by(MediaFile.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [
            {
                "id": item.id,
                "original_filename": item.original_filename,
                "media_type": item.media_type,
                "mime_type": item.mime_type,
                "file_size": item.file_size,
                "alt_text_en": item.alt_text_en,
                "alt_text_ta": item.alt_text_ta,
                "status": item.status,
                "uploaded_by": item.uploaded_by,
                "created_at": item.created_at,
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ==========================================
# GET - Secure Media File Access
# ==========================================

@router.get("/{media_id}/file")
def get_media_file(
    media_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(
        require_admin_permission("media.view")
    ),
):
    media = db.get(MediaFile, media_id)

    if media is None or media.status != "active":
        raise HTTPException(
            status_code=404,
            detail="Media file not found.",
        )

    safe_name = Path(
        media.stored_filename.replace("\\", "/")
    ).name

    file_path = (UPLOAD_DIR / safe_name).resolve()

    if file_path.parent != UPLOAD_DIR:
        raise HTTPException(
            status_code=403,
            detail="Invalid media path.",
        )

    if not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Stored file not found.",
        )

    return FileResponse(
        path=file_path,
        media_type=media.mime_type,
        filename=media.original_filename,
        content_disposition_type="attachment",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'",
        },
    )


# ==========================================
# DELETE - Soft Archive Media
# ==========================================

@router.delete("/{media_id}")
def archive_media(
    media_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(
        require_admin_permission("media.delete")
    ),
):
    try:
        media = (
            db.query(MediaFile)
            .filter(MediaFile.id == media_id)
            .with_for_update()
            .first()
        )

        if media is None:
            raise HTTPException(
                status_code=404,
                detail="Media file not found.",
            )

        if media.status == "archived":
            raise HTTPException(
                status_code=409,
                detail="Media file is already archived.",
            )

        before = {
            "id": media.id,
            "status": media.status,
        }

        media.status = "archived"

        db.flush()

        record_admin_audit(
            db,
            admin_id=admin.id,
            action="media.archived",
            entity="media",
            entity_id=media.id,
            before=before,
            after={
                "id": media.id,
                "status": "archived",
            },
            request=request,
        )

        db.commit()

        return {
            "message": "Media archived successfully.",
            "id": media_id,
            "status": "archived",
        }

    except Exception:
        db.rollback()
        raise
