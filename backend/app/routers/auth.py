
import re
import secrets
from datetime import UTC, datetime

import jwt

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Request,
    Depends,
    HTTPException,
    status,
)

from fastapi.responses import JSONResponse

from fastapi.security import (
    OAuth2PasswordBearer,
    OAuth2PasswordRequestForm,
)

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import E2E_MODE, external_setting, settings
from app.database import get_db
from app.models.user import User
from app.models.admin import AdminUser
from app.services import analytics, free_quota, google_identity, mother_account, rate_limits, user_privacy
from app.services.google_identity import verify_google_credential

from app.schemas.auth import (
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/auth/login",
)


# ----------------------------------------
# Generate Unique Username
# ----------------------------------------

def generate_username(
    email: str,
    db: Session,
) -> str:

    base = email.split("@")[0].lower()

    base = re.sub(
        r"[^a-z0-9_]",
        "_",
        base,
    )

    base = base[:70] or "user"

    username = base
    counter = 1

    while db.scalar(
        select(User.id).where(
            User.username == username
        )
    ) is not None:

        username = f"{base}_{counter}"
        counter += 1

    return username


# ----------------------------------------
# Register Mother
# ----------------------------------------

@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    data: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
):

    rate_limits.enforce(db, "register:mother:" + rate_limits.source_ip(request), 10)
    email = str(data.email).lower()

    existing_user = db.scalar(
        select(User).where(
            User.email == email
        )
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    username = generate_username(
        email,
        db,
    )

    new_user = User(
        username=username,
        full_name=data.name.strip(),
        email=email,
        hashed_password=hash_password(
            data.password
        ),
        role="MOTHER",
        is_active=True,
    )

    activated_at = datetime.now(UTC)
    db.add(new_user)

    try:
        db.flush()
        free_quota.record_signup(db, new_user.id, activated_at)
        db.commit()
        db.refresh(new_user)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="Email or username already exists. Please try again.",
        )

    access_token = create_access_token(
        user_id=new_user.id,
        role=new_user.role,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": new_user,
    }


# ----------------------------------------
# Mother Login
# ----------------------------------------

@router.post(
    "/login",
    response_model=TokenResponse,
)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):

    rate_limits.enforce(db, "login:mother:" + rate_limits.source_ip(request), 30)
    email = form_data.username.strip().lower()

    user = db.scalar(
        select(User).where(
            User.email == email
        )
    )

    if (
        user is None
        or user.role != "MOTHER"
        or len(form_data.password) > 128
        or not verify_password(
            form_data.password,
            user.hashed_password,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password.",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="This account is inactive.",
        )

    version = 0
    if user.role == "MOTHER" and user_privacy.active(db):
        account = user_privacy.account_lock(db, user.id)
        if not account["is_active"]:
            raise HTTPException(403, "This account is inactive.")
        # Close the race with a reset while credentials were being checked.
        current = user_privacy.sql(db, "SELECT session_version,hashed_password FROM users WHERE id=%s FOR UPDATE", (user.id,)).one()
        if current.hashed_password != user.hashed_password:
            raise HTTPException(401, "Incorrect email or password.")
        version = current.session_version
        user_privacy.sql(db, "UPDATE users SET last_active_at=%s WHERE id=%s", (user_privacy.now(),user.id))
        analytics.record(db, user.id, "login")
        db.commit()
    access_token = create_access_token(user.id, user.role, session_version=version)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
    }


# ----------------------------------------
# Get Current Logged-In User
# ----------------------------------------

def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:

    credentials_error = HTTPException(
        status_code=401,
        detail="Invalid or expired authentication token.",
        headers={
            "WWW-Authenticate": "Bearer"
        },
    )

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={
                "require": ["sub", "exp", "iat"]
            },
        )

        user_id = int(
            payload.get("sub")
        )

    except (
        jwt.InvalidTokenError,
        ValueError,
        TypeError,
    ):
        raise credentials_error

    user = db.get(
        User,
        user_id,
    )

    if user is None or user.role != "MOTHER" or payload.get("role") != user.role or payload.get("purpose"):
        raise credentials_error
    request.state.mother_session_version = None
    if user_privacy.active(db):
        version = user_privacy.sql(db, "SELECT session_version FROM users WHERE id=%s", (user.id,)).scalar_one_or_none()
        if payload.get("sv", 0) != version:
            raise credentials_error
        request.state.mother_session_version = version

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="This account is inactive.",
        )

    return user


# ----------------------------------------
# Admin-Only Dependency
# ----------------------------------------

def require_admin(
    current_user: User = Depends(
        get_current_user
    ),
) -> User:

    if current_user.role != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail="Admin access required.",
        )

    return current_user


# ----------------------------------------
# Mother-Only Dependency
# ----------------------------------------

def require_mother(
    current_user: User = Depends(
        get_current_user
    ),
) -> User:

    if current_user.role != "MOTHER":
        raise HTTPException(
            status_code=403,
            detail="Mother access required.",
        )

    return current_user


# ----------------------------------------
# Current User Profile
# ----------------------------------------

@router.get(
    "/me",
    response_model=UserResponse,
)
def get_my_profile(
    current_user: User = Depends(
        get_current_user
    ),
):
    return current_user

@router.post("/logout", status_code=204)
def logout(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_mother),
):
    version = request.state.mother_session_version
    if version is None:
        raise HTTPException(503, "Mother session revocation is unavailable.")
    # If a reset or another logout already revoked this version, leave newer sessions alone.
    user_privacy.sql(db, "UPDATE users SET session_version=session_version+1 "
                     "WHERE id=%s AND role='MOTHER' AND session_version=%s", (user.id, version))
    db.commit()


class ForgotPassword(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr


class ResetCode(ForgotPassword):
    code: str = Field(pattern=r"^[0-9]{6}$")


class AccountLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")


class ResetPassword(AccountLink):
    password: str = Field(min_length=8, max_length=128)


@router.post("/forgot-password", status_code=202)
def request_password_reset(body: ForgotPassword, request: Request, tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if mother_account.password_reset_email_enabled() and user_privacy.active(db):
        address = request.client.host if request.client else "unknown"
        if user_privacy.consume_limit(db, f"public-reset:{address}", 8, 60):
            tasks.add_task(mother_account.forgot_password,str(body.email).lower())
    return {"message":"If the account can receive a reset email, we will send one."}


def verify_account_link(db, request, token, purpose, password=None):
    user_privacy.readiness(db)
    address = request.client.host if request.client else "unknown"
    if not user_privacy.consume_limit(db, f"public-complete:{address}", 20, 60):
        raise HTTPException(429, "Too many requests. Try again later.")
    mother_account.use_token(db,token,purpose,password)
    return {"message":"Account action completed."}


@router.post("/password-reset/verify")
def verify_password_reset(body: ResetCode, request: Request, db: Session = Depends(get_db)):
    user_privacy.readiness(db)
    rate_limits.enforce(db, "password-reset-verify:" + rate_limits.source_ip(request), 30, 15)
    grant = mother_account.verify_reset_code(db, str(body.email).lower(), body.code)
    return JSONResponse({"reset_token": grant}, headers={"Cache-Control": "no-store"})


@router.post("/reset-password")
def reset_password(body: ResetPassword, request: Request, db: Session = Depends(get_db)):
    return verify_account_link(db,request,body.token,"password_reset",body.password)


@router.post("/verify-email")
def verify_email(body: AccountLink, request: Request, db: Session = Depends(get_db)):
    return verify_account_link(db,request,body.token,"verify_email")


class GoogleCredential(BaseModel):
    model_config = ConfigDict(extra="forbid")
    challenge: str = Field(min_length=40, max_length=1500)
    credential: str = Field(min_length=40, max_length=8000)


def google_client(request, db):
    if E2E_MODE:
        client_id = settings.E2E_GOOGLE_CLIENT_ID if settings.E2E_GOOGLE_ENABLED else None
        origin = settings.E2E_FRONTEND_ORIGIN
    else:
        client_id = external_setting("MOTHER_GOOGLE_CLIENT_ID")
        origin = settings.A14_MOTHER_ORIGIN if settings.A14_HOSTED else external_setting("MOTHER_GOOGLE_ORIGIN")
    if not client_id or not origin:
        raise HTTPException(503, "Google sign-in is currently unavailable.")
    if request.headers.get("origin") != origin:
        raise HTTPException(403, "Google sign-in is unavailable from this origin.")
    if not user_privacy.active(db) or "google_subject" not in {
        field["name"] for field in inspect(db.connection()).get_columns("users")
    }:
        raise HTTPException(503, "Google sign-in is awaiting configuration.")
    return client_id


class GoogleLoginLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticket: str = Field(min_length=40, max_length=1500)
    password: str = Field(min_length=1, max_length=128)


class GoogleReauthentication(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = Field(min_length=1, max_length=128)


def require_google_registry(db):
    if not google_identity.registry_ready(db):
        raise HTTPException(503, "Google account linking is awaiting configuration.")


def lock_google_mother(db, request, user_id):
    account = user_privacy.sql(
        db, "SELECT session_version, hashed_password, google_subject, is_active, anonymized_at "
            "FROM users WHERE id=%s AND role='MOTHER' FOR UPDATE", (user_id,),
    ).one_or_none()
    if (not account or not account.is_active or account.anonymized_at
            or account.session_version != request.state.mother_session_version):
        raise HTTPException(401, "Invalid or expired authentication token.")
    return account


def reauthenticate_google_mother(account, password):
    if account.google_subject:
        raise HTTPException(409, "Google is this account's only sign-in method.")
    if not verify_password(password, account.hashed_password):
        raise HTTPException(401, "Current password is incorrect.")


@router.get("/google/link")
def google_link_status(db: Session = Depends(get_db), user: User = Depends(require_mother)):
    if not google_identity.registry_ready(db):
        return {"available": False, "linked": False, "google_only": False}
    legacy_subject = user_privacy.sql(db, "SELECT google_subject FROM users WHERE id=%s", (user.id,)).scalar_one()
    return {"available": True, "linked": bool(legacy_subject or google_identity.find_mother_identity(db, user.id)),
            "google_only": bool(legacy_subject)}


@router.post("/google/link/challenge")
def google_link_challenge(body: GoogleReauthentication, request: Request, db: Session = Depends(get_db),
                          user: User = Depends(require_mother), token: str = Depends(oauth2_scheme)):
    client_id = google_client(request, db)
    require_google_registry(db)
    rate_limits.enforce(db, f"google:manage:{user.id}", 5, 15)
    account = lock_google_mother(db, request, user.id)
    reauthenticate_google_mother(account, body.password)
    if google_identity.find_mother_identity(db, user.id):
        raise HTTPException(409, "A Google account is already connected.")
    binding = google_identity.LinkBinding.for_session("MOTHER", user.id, token)
    return google_identity.issue_challenge(client_id, request.headers["origin"], link=binding)


@router.post("/google/link")
def google_link(body: GoogleCredential, request: Request, db: Session = Depends(get_db),
                user: User = Depends(require_mother), token: str = Depends(oauth2_scheme)):
    client_id = google_client(request, db)
    require_google_registry(db)
    rate_limits.enforce(db, f"google:link:{user.id}", 8, 15)
    binding = google_identity.LinkBinding.for_session("MOTHER", user.id, token)
    claims = google_identity.verify_exchange(
        db, body.challenge, body.credential, client_id, request.headers["origin"],
        link=binding, verifier=verify_google_credential,
    )
    account = lock_google_mother(db, request, user.id)
    if account.google_subject:
        raise HTTPException(409, "A Google account is already connected.")
    subject = claims["sub"]
    legacy_id = user_privacy.sql(db, "SELECT id FROM users WHERE google_subject=%s", (subject,)).scalar_one_or_none()
    if legacy_id is not None:
        raise HTTPException(409, "This Google identity cannot be connected.")
    try:
        google_identity.claim_identity(db, subject, binding)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This Google identity cannot be connected.") from None
    return {"available": True, "linked": True, "google_only": False}


@router.post("/google/unlink")
def google_unlink(body: GoogleReauthentication, request: Request, db: Session = Depends(get_db),
                  user: User = Depends(require_mother)):
    require_google_registry(db)
    rate_limits.enforce(db, f"google:manage:{user.id}", 5, 15)
    account = lock_google_mother(db, request, user.id)
    reauthenticate_google_mother(account, body.password)
    google_identity.disconnect_mother(db, user.id, google_only=bool(account.google_subject))
    # Revoke existing sessions so a former Google credential cannot retain a session.
    user_privacy.sql(db, "UPDATE users SET session_version=session_version+1 WHERE id=%s", (user.id,))
    db.commit()
    return {"available": True, "linked": False, "google_only": False, "sign_in_required": True}


@router.post("/google/challenge")
def google_challenge(request: Request, db: Session = Depends(get_db)):
    client_id = google_client(request, db)
    rate_limits.enforce(db, "google:challenge:" + rate_limits.source_ip(request), 12)
    return google_identity.issue_challenge(client_id, request.headers["origin"])


@router.post("/google/link-login", response_model=TokenResponse)
def google_link_login(body: GoogleLoginLink, request: Request, db: Session = Depends(get_db)):
    client_id = google_client(request, db)
    require_google_registry(db)
    rate_limits.enforce(db, "google:link-login:" + rate_limits.source_ip(request), 10, 15)
    origin = request.headers["origin"]
    intent = google_identity.read_login_link(body.ticket, client_id, origin)
    rate_limits.enforce(db, f"google:manage:{intent['account_id']}", 5, 15)
    user = db.scalar(select(User).where(User.id == intent["account_id"], User.role == "MOTHER")
                     .with_for_update().execution_options(populate_existing=True))
    if user is None:
        raise google_identity.invalid_credential()
    account = lock_google_mother_for_login(db, user, intent)
    reauthenticate_google_mother(account, body.password)
    subject = intent["sub"]
    if (db.scalar(select(AdminUser.id).where(AdminUser.email == user.email)) is not None
            or google_identity.find_mother_identity(db, user.id)
            or google_identity.find_identity(db, subject)):
        raise google_identity.invalid_credential()
    if user_privacy.sql(db, "SELECT id FROM users WHERE google_subject=%s", (subject,)).first():
        raise google_identity.invalid_credential()
    try:
        google_identity.register_google_mother(db, subject, user.id)
    except IntegrityError:
        db.rollback()
        raise google_identity.invalid_credential() from None
    return finish_google_login(db, user, account.session_version)


def lock_google_mother_for_login(db, user, intent):
    account = user_privacy.sql(db, "SELECT session_version, hashed_password, google_subject, "
                               "is_active, anonymized_at FROM users WHERE id=%s FOR UPDATE", (user.id,)).one()
    if (not account.is_active or account.anonymized_at or account.google_subject
            or account.session_version != intent["version"]
            or user_privacy.secret_hash(user.email.lower()) != intent["email_digest"]):
        raise google_identity.invalid_credential()
    return account


@router.post("/google", response_model=TokenResponse)
def google_login(body: GoogleCredential, request: Request, db: Session = Depends(get_db)):
    client_id = google_client(request, db)
    rate_limits.enforce(db, "google:verify:" + rate_limits.source_ip(request), 12)
    invalid = google_identity.invalid_credential()
    claims = google_identity.verify_exchange(
        db, body.challenge, body.credential, client_id, request.headers["origin"],
        verifier=verify_google_credential,
    )
    subject = claims["sub"]

    registry = google_identity.registry_ready(db)
    linked = google_identity.find_identity(db, subject) if registry else None
    if linked and linked.mother_id is None:
        raise invalid
    if linked:
        row = user_privacy.sql(db, "SELECT id, is_active, anonymized_at, session_version FROM users "
                                   "WHERE id=%s AND role='MOTHER' FOR UPDATE", (linked.mother_id,)).first()
        current = google_identity.find_identity(db, subject, lock=True)
        if row is None or current is None or current.mother_id != row.id:
            raise invalid
    else:
        row = user_privacy.sql(db, "SELECT id, is_active, anonymized_at, session_version FROM users "
                                   "WHERE google_subject=%s AND role='MOTHER' FOR UPDATE", (subject,)).first()
    version = 0
    if row:
        if not row.is_active or row.anonymized_at:
            raise invalid
        user = db.get(User, row.id)
        version = row.session_version
    else:
        email = claims.get("email")
        if claims.get("email_verified") is not True or not isinstance(email, str):
            raise invalid
        try:
            signup = RegisterRequest(name=str(claims.get("name") or "HerBloom Mother")[:150],
                                     email=email, password=secrets.token_urlsafe(32))
        except ValueError:
            raise invalid from None
        email = str(signup.email).lower()
        domain = email.rsplit("@", 1)[1]
        if domain != "gmail.com" and claims.get("hd") != domain:
            raise invalid
        conflict = HTTPException(409, "Google sign-in cannot create this account. Use your existing sign-in method.")
        if db.scalar(select(AdminUser.id).where(AdminUser.email == email)):
            raise conflict
        existing = user_privacy.sql(
            db, "SELECT id,role,is_active,anonymized_at,google_subject,session_version "
                "FROM users WHERE email=%s", (email,),
        ).one_or_none()
        if existing:
            if (registry and existing.role == "MOTHER" and existing.is_active and not existing.anonymized_at
                    and not existing.google_subject and not google_identity.find_mother_identity(db, existing.id)):
                ticket = google_identity.issue_login_link(
                    client_id, request.headers["origin"], subject, existing.id, existing.session_version, email,
                )
                return JSONResponse(status_code=409, content={"code": "google_link_required", "ticket": ticket},
                                    headers={"Cache-Control": "no-store"})
            raise conflict
        user = User(username=generate_username(email, db), full_name=signup.name.strip(), email=email,
                    hashed_password=hash_password(signup.password), role="MOTHER", is_active=True)
        db.add(user)
        try:
            db.flush()
            user_privacy.sql(db, "UPDATE users SET google_subject=%s,email_verified_at=%s WHERE id=%s",
                             (subject, user_privacy.now(), user.id))
            if registry:
                google_identity.register_google_mother(db, subject, user.id)
            free_quota.record_signup(db, user.id, datetime.now(UTC))
        except IntegrityError:
            db.rollback()
            raise conflict from None

    return finish_google_login(db, user, version)


def finish_google_login(db, user, version):
    user_privacy.sql(db, "UPDATE users SET last_active_at=%s WHERE id=%s", (user_privacy.now(), user.id))
    analytics.record(db, user.id, "login")
    db.commit()
    return {"user": user, "access_token": create_access_token(user.id, "MOTHER", session_version=version),
            "token_type": "bearer"}
