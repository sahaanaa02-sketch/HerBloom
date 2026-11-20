
from pathlib import Path
import os
from typing import Literal
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from dotenv import dotenv_values, load_dotenv
from pydantic import SecretStr, field_validator, model_validator

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]
E2E_MODE = os.environ.get("HERBLOOM_ENV") == "e2e"
E2E_DB_NAME = "herbloom_e2e_test"
E2E_DB_USER = "herbloom_e2e_user"


class Settings(BaseSettings):
    # ==========================================
    # MySQL Database
    # ==========================================
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str
    DB_PASSWORD: str
    DB_NAME: str
    DB_SSL_CA: Path | None = None

    # ==========================================
    # JWT Authentication
    # ==========================================
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ==========================================
    # Weekly Summary - Medical Rules
    # ==========================================
    # Medical thresholds remain disabled until
    # reviewed by a qualified healthcare professional.

    WEEKLY_LOW_MOOD_THRESHOLD: float | None = None

    WEEKLY_DISCOMFORT_DAYS_THRESHOLD: int | None = None

    WEEKLY_LOW_IRON_RATIO: float | None = None

    WEEKLY_GDM_FOLLOWUP_ENABLED: bool = False

    WEEKLY_GDM_FOLLOWUP_WEEKS: int | None = None

    A7_EXPORTS_ENABLED: bool = False
    A7_OUTBOUND_EMAIL_ENABLED: bool = False
    STAGE2_ENABLED: bool = False
    A9_ADMIN_INVITES_ENABLED: bool = False

    A14_HOSTED: bool = False
    A14_ADMIN_ORIGIN: str | None = None
    A14_MOTHER_ORIGIN: str | None = None
    A14_MEDIA_DIR: Path | None = None

    A12_PAYHERE_SANDBOX_ENABLED: bool = False
    A12_PAYHERE_MERCHANT_ID: str | None = None
    A12_PAYHERE_MERCHANT_SECRET: SecretStr | None = None
    A12_PAYHERE_NOTIFY_URL: str | None = None
    A12_PAYHERE_APP_ID: str | None = None
    A12_PAYHERE_APP_SECRET: SecretStr | None = None

    @field_validator("A14_HOSTED", "A12_PAYHERE_SANDBOX_ENABLED", "A7_EXPORTS_ENABLED", "A7_OUTBOUND_EMAIL_ENABLED", "STAGE2_ENABLED", "A9_ADMIN_INVITES_ENABLED", mode="before")
    @classmethod
    def explicit_feature_opt_in(cls, value):
        return value is True or (isinstance(value, str) and value.strip().lower() == "true")

    # ==========================================
    # Environment Configuration
    # ==========================================
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )


    @model_validator(mode="after")
    def validate_hosted(self):
        if not self.A14_HOSTED:
            return self
        origins = (self.A14_ADMIN_ORIGIN, self.A14_MOTHER_ORIGIN)
        if E2E_MODE or None in origins or origins[0] == origins[1]:
            raise ValueError("Hosted Admin and Mother origins must be distinct.")
        for origin in origins:
            url = urlsplit(origin)
            if (url.scheme != "https" or url.hostname is None or url.username or url.password or
                    url.path or url.query or url.fragment or "*" in origin or "." not in url.hostname):
                raise ValueError("Hosted origins must be exact HTTPS origins.")
        if self.DB_SSL_CA is None or not self.DB_SSL_CA.is_absolute() or not self.DB_SSL_CA.is_file():
            raise ValueError("Hosted MySQL requires an absolute CA certificate path.")
        media = self.A14_MEDIA_DIR
        if media is None or not media.is_absolute() or media.resolve().is_relative_to(ROOT_DIR.resolve()):
            raise ValueError("Hosted media requires an absolute private path outside the repository.")
        if self.ALGORITHM != "HS256" or len(self.SECRET_KEY.strip()) < 32:
            raise ValueError("Hosted Mother authentication requires a strong HS256 key.")
        if self.A7_EXPORTS_ENABLED or self.A7_OUTBOUND_EMAIL_ENABLED or self.A9_ADMIN_INVITES_ENABLED:
            raise ValueError("Restricted A7 and A9 operations must remain disabled.")
        return self


class E2ESettings(Settings):
    ADMIN_JWT_SECRET: str
    ADMIN_TOKEN_MINUTES: int = 60
    JOURNAL_ENCRYPTION_KEY: str
    E2E_API_PORT: int
    E2E_FRONTEND_ORIGIN: Literal["http://127.0.0.1:5183"]
    E2E_MEDIA_DIR: Path

    @classmethod
    def settings_customise_sources(
        cls, settings_cls, init_settings, env_settings, dotenv_settings, file_secret_settings
    ):
        # E2E values come exclusively from the explicitly selected private file.
        return (init_settings,)

    @model_validator(mode="after")
    def validate_isolation(self):
        if self.E2E_API_PORT != 8100:
            raise ValueError("E2E requires API port 8100.")
        if self.DB_NAME != E2E_DB_NAME or self.DB_USER != E2E_DB_USER:
            raise ValueError("E2E requires the dedicated database name and account.")
        if self.DB_HOST not in ("localhost", "127.0.0.1") or not 1 <= self.DB_PORT <= 65535:
            raise ValueError("E2E requires a local MySQL connection.")
        if not self.DB_PASSWORD.strip():
            raise ValueError("E2E requires a database password.")
        if self.ALGORITHM != "HS256" or len({self.SECRET_KEY, self.ADMIN_JWT_SECRET,
                                            self.JOURNAL_ENCRYPTION_KEY}) != 3:
            raise ValueError("E2E requires separate keys and HS256.")
        if min(len(self.SECRET_KEY.strip()), len(self.ADMIN_JWT_SECRET.strip())) < 32:
            raise ValueError("E2E JWT keys must contain at least 32 characters each.")
        Fernet(self.JOURNAL_ENCRYPTION_KEY.encode("ascii"))
        self.E2E_MEDIA_DIR = validate_e2e_media_dir(self.E2E_MEDIA_DIR)
        return self


def e2e_home() -> Path:
    local_app_data = Path(os.environ.get("LOCALAPPDATA", ""))
    if not local_app_data.is_absolute():
        raise RuntimeError("E2E requires an absolute LOCALAPPDATA path.")
    root = local_app_data.resolve() / "HerBloom" / "E2E"
    if root.resolve() != root or root.is_relative_to(ROOT_DIR.resolve()):
        raise RuntimeError("E2E storage must remain in its dedicated local directory.")
    return root


def validate_e2e_media_dir(media_dir: Path) -> Path:
    expected = e2e_home() / "media"
    if not media_dir.is_absolute() or media_dir.resolve() != expected or expected.resolve() != expected:
        raise ValueError("E2E requires the dedicated local media directory.")
    if expected.exists() and not expected.is_dir():
        raise ValueError("The E2E media path is not a directory.")
    return expected


def load_settings() -> Settings:
    if not E2E_MODE:
        if os.environ.get("HERBLOOM_E2E_ENV_FILE"):
            raise RuntimeError("Set HERBLOOM_ENV=e2e to use an E2E settings file.")
        return Settings()

    configured = Path(os.environ.get("HERBLOOM_E2E_ENV_FILE", ""))
    expected = e2e_home() / "backend.env"
    if not configured.is_absolute() or configured.resolve() != expected or expected.resolve() != expected:
        raise RuntimeError("Set HERBLOOM_E2E_ENV_FILE to the dedicated local backend.env.")
    if not expected.is_file():
        raise RuntimeError("The private E2E backend.env is missing.")
    try:
        return E2ESettings(**dotenv_values(expected, interpolate=False))
    except (OSError, ValueError):
        raise RuntimeError(
            "Invalid private E2E configuration. Check the database, ports, keys, and media settings."
        ) from None


settings = load_settings()


def external_setting(name: str, default: str | None = None) -> str | None:
    if E2E_MODE:
        if name == "JOURNAL_ENCRYPTION_KEY":
            return settings.JOURNAL_ENCRYPTION_KEY
        return default  # E2E has no provider credentials, including inherited process values.
    load_dotenv(ROOT_DIR / ".env")
    return os.getenv(name, default)


def media_storage_dir() -> Path:
    if E2E_MODE:
        return validate_e2e_media_dir(settings.E2E_MEDIA_DIR)
    return (settings.A14_MEDIA_DIR or Path("uploads/admin_media")).resolve()


# ==============================================
# Weekly Summary - Threshold Configuration
# ==============================================
def get_weekly_thresholds():
    """
    Return configured weekly summary rules.

    Medical thresholds are disabled by default
    until clinically reviewed.
    """

    return {
        "low_mood": settings.WEEKLY_LOW_MOOD_THRESHOLD,

        "repeated_discomfort_days":
            settings.WEEKLY_DISCOMFORT_DAYS_THRESHOLD,

        "low_iron_ratio":
            settings.WEEKLY_LOW_IRON_RATIO,

        "gdm_test_followup_enabled":
            settings.WEEKLY_GDM_FOLLOWUP_ENABLED,

        "gdm_followup_weeks":
            settings.WEEKLY_GDM_FOLLOWUP_WEEKS,
    }
