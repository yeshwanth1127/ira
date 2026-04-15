import re

from pydantic import BaseModel, Field, field_validator

# Allow internal/dev domains like *.local (EmailStr rejects many of these)
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+$")


class LoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        v = v.strip()
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email format")
        return v


class RefreshBody(BaseModel):
    refresh_token: str = Field(min_length=10)
