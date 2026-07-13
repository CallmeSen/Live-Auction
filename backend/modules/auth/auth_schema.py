import re
import uuid

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)

from common.enum import UserRole, UserStatus


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    full_name: str = Field(
        alias="fullName",
        min_length=2,
        max_length=255,
    )
    phone: str = Field(
        min_length=9,
        max_length=15,
    )

    model_config = ConfigDict(
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    @field_validator("email")
    @classmethod
    def normalize_email(cls, email: EmailStr) -> str:
        return str(email).lower()

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, full_name: str) -> str:
        if not full_name.strip():
            raise ValueError("Full name must not be blank")

        return full_name.strip()

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, phone: str) -> str:
        normalized_phone = re.sub(r"[\s-]", "", phone)

        if not re.fullmatch(r"\+?\d{9,15}", normalized_phone):
            raise ValueError(
                "Phone must contain 9 to 15 digits "
                "and may start with +"
            )

        return normalized_phone


class RegisterUserData(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str = Field(serialization_alias="fullName")
    phone: str
    role: UserRole
    status: UserStatus

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class RegisterResponse(BaseModel):
    status: int
    code: int
    message: str
    data: RegisterUserData


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class LoginUserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str = Field(serialization_alias="fullName")
    role: UserRole
    status: UserStatus


class LoginData(BaseModel):
    access_token: str = Field(serialization_alias="accessToken")
    token_type: str = Field(
        default="Bearer",
        serialization_alias="tokenType",
    )
    user: LoginUserResponse


class LoginResponse(BaseModel):
    status: int
    code: int
    message: str
    data: LoginData