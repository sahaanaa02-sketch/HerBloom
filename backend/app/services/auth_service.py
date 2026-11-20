
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from app.config import settings


# ----------------------------------------
# Password Hashing Configuration
# ----------------------------------------

password_hash = PasswordHash.recommended()


# ----------------------------------------
# Hash Password
# ----------------------------------------

def hash_password(password: str) -> str:
    """
    Convert a plain-text password into
    a secure Argon2 password hash.
    """
    return password_hash.hash(password)


# ----------------------------------------
# Verify Password
# ----------------------------------------

def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    """
    Verify a login password against
    the stored password hash.
    """
    return password_hash.verify(
        plain_password,
        hashed_password,
    )


# ----------------------------------------
# Create JWT Access Token
# ----------------------------------------

def create_access_token(
    user_id: int,
    role: str,
    session_version: int = 0,
) -> str:
    """
    Generate a signed JWT access token.
    """

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "role": role,
        "sv": session_version,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }

    encoded_token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    return encoded_token
