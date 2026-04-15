import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token_safe,
    hash_password,
    verify_password,
)
from app.core.config import get_settings
from app.db.session import get_db
from app.models.entities import DepartmentRole, Organization, ProjectMembership, User
from app.schemas.auth_body import LoginBody, RefreshBody
from app.schemas.user import MeOut, MembershipOut, Token, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut)
def register(body: UserCreate, db: Annotated[Session, Depends(get_db)]) -> User:
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    settings = get_settings()
    # Determine role based on email domain
    role_name = settings.get_role_for_email(body.email)
    default_role = DepartmentRole(role_name) if role_name else DepartmentRole.contracts
    
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        default_role=default_role,
    )
    db.add(user)
    db.flush()
    org = db.query(Organization).first()
    if not org:
        org = Organization(name="Default Org")
        db.add(org)
        db.flush()
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    body: LoginBody,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")
    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id))
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}


@router.post("/refresh", response_model=Token)
def refresh_token_ep(
    body: RefreshBody,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    payload = decode_token_safe(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    try:
        uid = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=401, detail="Invalid subject") from e
    user = db.get(User, uid)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(str(user.id))
    new_refresh = create_refresh_token(str(user.id))
    return {"access_token": access, "refresh_token": new_refresh, "token_type": "bearer"}


@router.get("/me", response_model=MeOut)
def me(
    current: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MeOut:
    user = (
        db.query(User)
        .options(selectinload(User.memberships).selectinload(ProjectMembership.project))
        .filter(User.id == current.id)
        .first()
    )
    assert user
    memberships_out: list[MembershipOut] = []
    for m in user.memberships:
        memberships_out.append(
            MembershipOut(
                project_id=m.project_id,
                project_name=m.project.name,
                project_code=m.project.code,
                role=m.role,
            )
        )
    return MeOut(user=UserOut.model_validate(user), memberships=memberships_out)
