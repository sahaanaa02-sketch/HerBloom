
from cryptography.fernet import Fernet, InvalidToken
from app.config import external_setting

PREFIX = "hbenc:v1:"


def get_cipher():
    key = external_setting("JOURNAL_ENCRYPTION_KEY")

    if not key:
        raise RuntimeError(
            "JOURNAL_ENCRYPTION_KEY is missing from .env"
        )

    try:
        return Fernet(key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError(
            "Invalid JOURNAL_ENCRYPTION_KEY"
        ) from exc


def encrypt_text(value: str) -> str:
    if not value:
        return ""

    if value.startswith(PREFIX):
        return value

    encrypted = get_cipher().encrypt(
        value.encode("utf-8")
    ).decode("utf-8")

    return PREFIX + encrypted


def decrypt_text(value: str) -> str:
    if not value:
        return ""

    # Compatibility with older, unencrypted entries.
    if not value.startswith(PREFIX):
        return value

    token = value[len(PREFIX):]

    try:
        return get_cipher().decrypt(
            token.encode("utf-8")
        ).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError(
            "Unable to decrypt journal entry"
        ) from exc
