
import re

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

from fastapi.security import (
    OAuth2PasswordBearer,
    OAuth2PasswordRequestForm,
)

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
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


@router.post("/reset-password")
def reset_password(body: ResetPassword, request: Request, db: Session = Depends(get_db)):
    return verify_account_link(db,request,body.token,"password_reset",body.password)


@router.post("/verify-email")
def verify_email(body: AccountLink, request: Request, db: Session = Depends(get_db)):
    return verify_account_link(db,request,body.token,"verify_email")
