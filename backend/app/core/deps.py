from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token_safe
from app.db.session import get_db
from app.models.entities import DepartmentRole, Project, ProjectMembership, User

security = HTTPBearer(auto_error=False)


def get_token_payload(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token_safe(creds.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return payload


def get_current_user(
    payload: Annotated[dict, Depends(get_token_payload)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        uid = uuid.UUID(sub)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid subject") from e
    user = db.get(User, uid)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")
    return user


def require_superuser(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


def get_project_membership(
    user: User,
    db: Session,
    project_id: uuid.UUID,
) -> ProjectMembership | None:
    return (
        db.query(ProjectMembership)
        .filter(
            ProjectMembership.user_id == user.id,
            ProjectMembership.project_id == project_id,
        )
        .first()
    )


def require_project_access(
    user: User,
    db: Session,
    project_id: uuid.UUID,
    allowed_roles: set[DepartmentRole] | None = None,
) -> ProjectMembership | SimpleNamespace:
    proj = db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    m = get_project_membership(user, db, project_id)
    if user.is_superuser and not m:
        m = SimpleNamespace(
            id=None,
            user_id=user.id,
            project_id=project_id,
            role=DepartmentRole.admin,
        )
    elif not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a project member")
    if allowed_roles is not None and m.role not in allowed_roles and m.role != DepartmentRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    return m


def role_contracts_qs() -> set[DepartmentRole]:
    return {DepartmentRole.contracts, DepartmentRole.qs, DepartmentRole.admin}


def role_contracts() -> set[DepartmentRole]:
    return {DepartmentRole.contracts, DepartmentRole.admin}


def role_qs() -> set[DepartmentRole]:
    return {DepartmentRole.qs, DepartmentRole.admin}


def role_design() -> set[DepartmentRole]:
    return {DepartmentRole.design, DepartmentRole.admin}


def role_contracts_qs_read() -> set[DepartmentRole]:
    return {DepartmentRole.contracts, DepartmentRole.qs, DepartmentRole.admin}
