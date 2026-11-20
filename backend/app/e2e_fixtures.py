
import socket
import struct
import zlib
from datetime import timedelta

from dotenv import dotenv_values
from sqlalchemy import MetaData, select
from sqlalchemy.orm import Session

from app.config import e2e_home, media_storage_dir
from app.database import engine
from app.e2e_guard import verify_database_identity
from app.e2e_schema import verify_schema
from app.models.admin import AdminPermission, AdminRole, AdminUser
from app.models.article import Article
from app.models.media import MediaFile
from app.models.mother_profile import MotherProfile
from app.models.recovery import RecoveryExercise
from app.models.user import User
from app.services import free_quota
from app.services.auth_service import hash_password
from app.services.recovery_rules import local_today

ADMIN_EMAIL = "admin.e2e@example.com"
MOTHER_EMAIL = "mother.e2e@example.com"
IMAGE_NAME = "herbloom-e2e-fixture.png"
PERMISSIONS = (
    "overview.view", "content.view", "content.create", "content.edit", "content.delete",
    "media.view", "media.upload", "media.delete",
    "content.approve", "clinical.view", "users.view", "users.manage",
    "ai.view", "ai.manage",
    "analytics.view", "support.view", "support.reply", "support.manage",
    "settings.view", "settings.manage", "audit.view",
    "safety.view", "safety.edit", "safety.approve",
    "nutrition.view", "nutrition.create", "nutrition.edit", "nutrition.delete", "nutrition.approve",
)


def fixture_credentials():
    path = e2e_home() / "backend.env"
    if path.resolve() != path:
        raise RuntimeError("Test credentials must remain in the local E2E settings file.")
    values = dotenv_values(path, interpolate=False)
    names = ("E2E_ADMIN_PASSWORD", "E2E_MOTHER_PASSWORD", "E2E_ADMIN_TOTP_SECRET")
    if any(not values.get(name) or len(values[name]) < 24 for name in names):
        raise RuntimeError("The private E2E fixture credentials are missing or invalid.")
    credentials = tuple(values[name] for name in names)
    if len(set(credentials)) != 3:
        raise RuntimeError("Use distinct E2E fixture credentials.")
    return credentials


def fixture_png():
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))

    header = struct.pack(">2I5B", 48, 32, 8, 2, 0, 0, 0)
    rows = b"".join(b"\x00" + bytes((123, 35, 70) if y < 16 else (246, 211, 219)) * 48 for y in range(32))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def add_fixtures(db, image, credentials):
    admin_password, mother_password, totp_secret = credentials
    role = AdminRole(name="e2e_content_manager", permissions=[AdminPermission(key=key) for key in PERMISSIONS])
    admin = AdminUser(email=ADMIN_EMAIL, name="E2E Admin", password_hash=hash_password(admin_password),
                      active=True, totp_enabled=True, totp_secret=totp_secret, roles=[role])
    mother = User(username="e2e_mother", email=MOTHER_EMAIL, full_name="E2E Mother",
                  hashed_password=hash_password(mother_password), role="MOTHER")
    db.add_all([admin, mother])
    db.flush()
    free_quota.record_signup(db, mother.id, free_quota.utc_now())
    db.add(MotherProfile(user_id=mother.id, onboarding_done=True, onboarding_step=5,
                         baby_birth_date=local_today() - timedelta(weeks=6), delivery_type="vaginal",
                         exercise_cleared="yes", activity_limits="no", first_baby=True))
    media = MediaFile(original_filename=IMAGE_NAME, stored_filename=IMAGE_NAME, file_path=str(image),
                      media_type="image", mime_type="image/png", file_size=len(fixture_png()),
                      status="active", uploaded_by=admin.id)
    db.add(media)
    db.flush()
    for index, status in enumerate([None] * 10 + ["draft", "in_review"], 1):
        db.add(Article(slug=f"e2e-article-{index}", category="recovery", title_en=f"E2E article {index}",
                       title_ta=f"சோதனை கட்டுரை {index}", body_en="Synthetic fixture for browser testing.",
                       body_ta="உலாவி சோதனைக்கான பதிவு.", published=status is None,
                       editorial_status=status, image_media_id=media.id if status else None))
    for index, status in enumerate([None] * 7 + ["draft", "in_review"], 1):
        db.add(RecoveryExercise(
            name=f"E2E exercise {index}", name_ta=f"சோதனை பயிற்சி {index}",
            category="breathing" if index % 2 else "stretching",
            steps=["Fixture step one", "Fixture step two"], steps_ta=["முதல் படி", "இரண்டாம் படி"],
            duration_minutes=3, safety_notes="Synthetic fixture.", safety_notes_ta="சோதனை பதிவு.",
            contraindications="For testing only.", contraindications_ta="சோதனைக்கு மட்டும்.",
            min_week=12 if index == 2 else 0, allowed_delivery_types=["vaginal"],
            needs_clearance=True, editorial_status=status, image_media_id=media.id if status else None,
            reviewed_by="Synthetic E2E reviewer" if index == 1 else None,
            review_date=local_today() if index == 1 else None,
        ))


def write_fixtures(reset=False):
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", 8100)) == 0:
            raise RuntimeError("Stop the E2E API before creating or resetting fixtures.")
    credentials = fixture_credentials()
    directory = media_storage_dir()
    entries = list(directory.iterdir()) if directory.exists() else []
    if any(file.resolve() != file or not file.is_file() for file in entries):
        raise RuntimeError("E2E media contains an unexpected path. No files were removed.")
    if not reset and entries:
        raise RuntimeError("E2E media already contains fixtures. Use the guarded reset.")
    image = directory / IMAGE_NAME
    created_image = False
    try:
        with Session(engine) as db, db.begin():
            connection = db.connection()
            verify_database_identity(connection)
            verify_schema(connection)
            schema = MetaData()
            schema.reflect(bind=connection)
            tables = schema.sorted_tables
            if reset:
                for table in reversed(tables):
                    db.execute(table.delete())
            elif any(db.scalar(select(table).limit(1)) is not None for table in tables):
                raise RuntimeError("E2E tables are not empty. Use the guarded reset.")
            add_fixtures(db, image, credentials)
            db.flush()
            directory.mkdir(parents=True, exist_ok=True)
            if image.exists() and image.read_bytes() != fixture_png():
                raise RuntimeError("An unexpected file occupies the fixture image path.")
            if not image.exists():
                with image.open("xb") as handle:
                    created_image = True
                    handle.write(fixture_png())
    except Exception:
        if created_image:
            image.unlink(missing_ok=True)
        raise
    if reset:
        for entry in entries:
            if entry != image:
                entry.unlink()
    print("E2E fixtures ready: 1 admin, 1 mother/profile, 12 articles, 9 exercises, 1 media file.")
