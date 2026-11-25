import hashlib
import re
import secrets
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt
from fastapi import HTTPException
from sqlalchemy import inspect, select

from app.config import E2E_MODE, settings
from app.models.admin import AdminUser
from app.models.google_identity import GoogleIdentity
from app.models.user import User
from app.services import user_privacy


@dataclass(frozen=True)
class LinkBinding:
    # Callers must derive these from a recently reauthenticated session.
    role: Literal["MOTHER", "ADMIN"]
    account_id: int
    session_digest: str

    @classmethod
    def for_session(cls, role: Literal["MOTHER", "ADMIN"], account_id: int, session_token: str):
        return cls(role, account_id, hashlib.sha256(session_token.encode()).hexdigest())


def invalid_credential():
    return HTTPException(401, "Google sign-in could not be verified. Try again.")


def issue_challenge(client_id: str, origin: str, *, link: LinkBinding | None = None):
    nonce = secrets.token_urlsafe(32)
    claims = {
        "purpose": "google_link" if link else "mother_google",
        "nonce": nonce,
        "aud": client_id,
        "origin": origin,
        "exp": datetime.now(UTC) + timedelta(minutes=5),
    }
    if link:
        claims["link"] = asdict(link)
    return {
        "client_id": client_id,
        "nonce": nonce,
        "challenge": jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM),
    }


def verify_google_credential(credential, client_id):
    if E2E_MODE and (
        not settings.E2E_GOOGLE_ENABLED or client_id != settings.E2E_GOOGLE_CLIENT_ID
    ):
        raise HTTPException(503, "External Google requests are disabled in E2E.")

    from google.auth.exceptions import GoogleAuthError, TransportError
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2.id_token import verify_oauth2_token

    try:
        transport = GoogleRequest()
        return verify_oauth2_token(
            credential, lambda url, **kwargs: transport(url, timeout=5, **kwargs), client_id
        )
    except TransportError:
        raise HTTPException(503, "Google sign-in is temporarily unavailable.") from None
    except GoogleAuthError:
        raise ValueError("Invalid Google credential.") from None


def verify_exchange(db, challenge, credential, client_id, origin, *, link=None,
                    verifier=verify_google_credential):
    invalid = invalid_credential()
    try:
        claims = jwt.decode(challenge, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
                            audience=client_id, options={"require": ["exp", "aud", "purpose", "nonce", "origin"]})
        if (claims["purpose"] != ("google_link" if link else "mother_google")
                or claims["origin"] != origin or not isinstance(claims["nonce"], str)
                or claims.get("link") != (asdict(link) if link else None)):
            raise invalid
        identity = verifier(credential, client_id)
    except (jwt.InvalidTokenError, ValueError):
        raise invalid from None
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Google sign-in is temporarily unavailable.") from None

    subject = identity.get("sub")
    if not isinstance(subject, str) or not re.fullmatch(r"[0-9A-Za-z_-]{1,255}", subject):
        raise invalid
    if identity.get("nonce") != claims["nonce"]:
        raise invalid
    if link and identity.get("email_verified") is not True:
        raise invalid
    if not user_privacy.consume_limit(db, "google:nonce:" + claims["nonce"], 1, 10):
        raise invalid
    return identity


def issue_login_link(client_id, origin, subject, account_id, version, email):
    # Called only after the one-use Google exchange has verified this subject and email.
    return jwt.encode({
        "purpose": "mother_google_link_login",
        "aud": client_id,
        "origin": origin,
        "sub": subject,
        "account_id": account_id,
        "version": version,
        "email_digest": user_privacy.secret_hash(email),
        "exp": datetime.now(UTC) + timedelta(minutes=5),
    }, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def read_login_link(ticket, client_id, origin):
    try:
        intent = jwt.decode(
            ticket, settings.SECRET_KEY, algorithms=[settings.ALGORITHM], audience=client_id,
            options={"require": ["exp", "aud", "purpose", "origin", "sub", "account_id", "version", "email_digest"]},
        )
    except jwt.InvalidTokenError:
        raise invalid_credential() from None
    if (intent["purpose"] != "mother_google_link_login" or intent["origin"] != origin
            or not re.fullmatch(r"[0-9A-Za-z_-]{1,255}", intent["sub"])
            or type(intent["account_id"]) is not int or type(intent["version"]) is not int):
        raise invalid_credential()
    return intent


def registry_ready(db):
    return inspect(db.connection()).has_table(GoogleIdentity.__tablename__)


def find_identity(db, subject: str, *, lock=False):
    query = select(GoogleIdentity).where(GoogleIdentity.subject == subject)
    return db.scalar(query.with_for_update().execution_options(populate_existing=True) if lock else query)


def find_mother_identity(db, account_id: int, *, lock=False):
    query = select(GoogleIdentity).where(GoogleIdentity.mother_id == account_id)
    return db.scalar(query.with_for_update().execution_options(populate_existing=True) if lock else query)


def register_google_mother(db, subject: str, account_id: int):
    db.add(GoogleIdentity(subject=subject, mother_id=account_id))
    db.flush()


def disconnect_mother(db, account_id: int, *, google_only: bool):
    if google_only:
        raise HTTPException(409, "Google is this account's only sign-in method.")
    identity = find_mother_identity(db, account_id, lock=True)
    if identity is None:
        raise HTTPException(409, "No Google account is connected.")
    db.delete(identity)


def claim_identity(db, subject: str, owner: LinkBinding):
    # The caller establishes recent reauthentication and owns the transaction.
    # Do not overwrite an existing registry entry. Unique keys arbitrate races.
    if not re.fullmatch(r"[0-9A-Za-z_-]{1,255}", subject):
        raise invalid_credential()
    if owner.role == "MOTHER":
        account_id = db.scalar(select(User.id).where(User.id == owner.account_id, User.role == "MOTHER", User.is_active.is_(True)))
        identity = GoogleIdentity(subject=subject, mother_id=account_id)
    elif owner.role == "ADMIN":
        account_id = db.scalar(select(AdminUser.id).where(AdminUser.id == owner.account_id, AdminUser.active.is_(True)))
        identity = GoogleIdentity(subject=subject, admin_id=account_id)
    else:
        raise invalid_credential()
    if account_id is None:
        raise invalid_credential()
    db.add(identity)
    db.flush()
    return identity
