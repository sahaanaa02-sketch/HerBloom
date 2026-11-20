
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Literal


# ----------------------------------------
# Register Request
# ----------------------------------------

class RegisterRequest(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=150
    )

    email: EmailStr

    password: str = Field(
        min_length=8,
        max_length=128
    )


# ----------------------------------------
# User Response
# ----------------------------------------

class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    email: EmailStr
    role: Literal["ADMIN", "MOTHER"]
    is_active: bool

    model_config = ConfigDict(
        from_attributes=True
    )


# ----------------------------------------
# JWT Token Response
# ----------------------------------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ----------------------------------------
# Simple Message Response
# ----------------------------------------

class MessageResponse(BaseModel):
    message: str
