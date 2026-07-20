import re
import uuid
from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)

from app.utils.password import validate_admin_password
from common.enum import UserRole, UserStatus


class CreateAdminUserRequest(BaseModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(max_length=72)
    full_name: str = Field(
        alias="fullName",
        min_length=2,
        max_length=255,
    )
    phone: str = Field(max_length=30)

    model_config = ConfigDict(
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    @field_validator("email")
    @classmethod
    def normalize_email(cls, email: EmailStr) -> str:
        return str(email).lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, password: str) -> str:
        validate_admin_password(password)

        return password

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, full_name: str) -> str:
        if not full_name:
            raise ValueError("Full name must not be blank")

        return full_name

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, phone: str) -> str:
        if not phone:
            raise ValueError("Phone is required")

        normalized_phone = re.sub(r"[\s-]", "", phone)

        if not re.fullmatch(r"\+?\d{9,15}", normalized_phone):
            raise ValueError(
                "Phone must contain 9 to 15 digits "
                "and may start with +"
            )

        return normalized_phone


class CreateAdminUserData(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str = Field(serialization_alias="fullName")
    phone: str
    role: UserRole
    status: UserStatus
    created_at: datetime = Field(serialization_alias="createdAt")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class CreateAdminUserResponse(BaseModel):
    status: int
    code: str
    message: str
    data: CreateAdminUserData
