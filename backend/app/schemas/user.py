import re
import uuid

from pydantic import BaseModel, Field, field_validator

from app.models.entities import DepartmentRole

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+$")


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8)
    full_name: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        v = v.strip()
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email format")
        return v


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    default_role: DepartmentRole
    is_active: bool
    is_superuser: bool

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    type: str | None = None


class MembershipOut(BaseModel):
    project_id: uuid.UUID
    project_name: str
    project_code: str
    role: DepartmentRole

    model_config = {"from_attributes": True}


class MeOut(BaseModel):
    user: UserOut
    memberships: list[MembershipOut]
