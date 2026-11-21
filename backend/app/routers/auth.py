
import re
import secrets
from datetime import UTC, datetime, timedelta

import jwt

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Request,
    Depends,
    HTTPException,
    status,
)

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
from app.services import analytics, free_quota, mother_account, rate_limits, user_privacy

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
    db: Session = Depends(get_db),
):

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
    if user.role == "MOTHER" and user_privacy.active(db):
        version = user_privacy.sql(db, "SELECT session_version FROM users WHERE id=%s", (user.id,)).scalar_one_or_none()
        if payload.get("sv", 0) != version:
            raise credentials_error

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

class ForgotPassword(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr


class AccountLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]+$")


class ResetPassword(AccountLink):
    password: str = Field(min_length=8, max_length=128)


@router.post("/forgot-password", status_code=202)
def request_password_reset(body: ForgotPassword, request: Request, tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if mother_account.outbound_email_enabled() and user_privacy.active(db):
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
def verify_password_reset(body: AccountLink, request: Request, db: Session = Depends(get_db)):
    user_privacy.readiness(db)
    rate_limits.enforce(db, "password-reset-verify:" + rate_limits.source_ip(request), 10, 15)
    mother_account.valid_token(db, body.token, "password_reset")
    return {"message": "Verification successful."}


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


@router.post("/google/challenge")
def google_challenge(request: Request, db: Session = Depends(get_db)):
    client_id = google_client(request, db)
    rate_limits.enforce(db, "google:challenge:" + rate_limits.source_ip(request), 12)
    nonce = secrets.token_urlsafe(32)
    challenge = jwt.encode({"purpose": "mother_google", "nonce": nonce,
                            "exp": datetime.now(UTC) + timedelta(minutes=5)},
                           settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return {"client_id": client_id, "nonce": nonce, "challenge": challenge}


@router.post("/google", response_model=TokenResponse)
def google_login(body: GoogleCredential, request: Request, db: Session = Depends(get_db)):
    client_id = google_client(request, db)
    rate_limits.enforce(db, "google:verify:" + rate_limits.source_ip(request), 12)
    invalid = HTTPException(401, "Google sign-in could not be verified. Try again.")
    try:
        challenge = jwt.decode(body.challenge, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
                               options={"require": ["exp", "purpose", "nonce"]})
        if challenge["purpose"] != "mother_google" or not isinstance(challenge["nonce"], str):
            raise invalid
        claims = verify_google_credential(body.credential, client_id)
    except (jwt.InvalidTokenError, ValueError):
        raise invalid from None
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Google sign-in is temporarily unavailable.") from None

    subject = claims.get("sub")
    if not isinstance(subject, str) or not re.fullmatch(r"[0-9A-Za-z_-]{1,255}", subject):
        raise invalid
    if claims.get("nonce") != challenge["nonce"]:
        raise invalid
    if not user_privacy.consume_limit(db, "google:nonce:" + challenge["nonce"], 1, 10):
        raise invalid

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
        if db.scalar(select(User.id).where(User.email == email)) or db.scalar(select(AdminUser.id).where(AdminUser.email == email)):
            raise conflict
        user = User(username=generate_username(email, db), full_name=signup.name.strip(), email=email,
                    hashed_password=hash_password(signup.password), role="MOTHER", is_active=True)
        db.add(user)
        try:
            db.flush()
            user_privacy.sql(db, "UPDATE users SET google_subject=%s,email_verified_at=%s WHERE id=%s",
                             (subject, user_privacy.now(), user.id))
            free_quota.record_signup(db, user.id, datetime.now(UTC))
        except IntegrityError:
            db.rollback()
            raise conflict from None

    user_privacy.sql(db, "UPDATE users SET last_active_at=%s WHERE id=%s", (user_privacy.now(), user.id))
    analytics.record(db, user.id, "login")
    db.commit()
    return {"user": user, "access_token": create_access_token(user.id, "MOTHER", session_version=version),
            "token_type": "bearer"}
