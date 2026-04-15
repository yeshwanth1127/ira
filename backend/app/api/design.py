import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_project_access, role_design
from app.db.session import get_db
from app.models.entities import (
    ChangeOrder,
    ChangeOrderRequestKind,
    ChangeOrderStatus,
    DesignPackage,
    DesignPackageStatus,
    User,
)
from app.schemas.design import (
    ChangeOrderCreate,
    ChangeOrderOut,
    DesignApproveDrawing,
    DesignPackageCreate,
    DesignPackageOut,
)
from app.services.audit import log_transition

router = APIRouter(prefix="/projects/{project_id}/design", tags=["design"])


@router.post("/packages", response_model=DesignPackageOut)
def create_package(
    project_id: uuid.UUID,
    body: DesignPackageCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DesignPackage:
    require_project_access(user, db, project_id, role_design())
    p = DesignPackage(project_id=project_id, label=body.label)
    db.add(p)
    db.flush()
    log_transition(
        db,
        project_id=project_id,
        entity_type="design_package",
        entity_id=p.id,
        from_status=None,
        to_status=p.status.value,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(p)
    return p


@router.get("/packages", response_model=list[DesignPackageOut])
def list_packages(
    project_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[DesignPackage]:
    require_project_access(user, db, project_id, role_design())
    return (
        db.query(DesignPackage)
        .filter(DesignPackage.project_id == project_id)
        .order_by(DesignPackage.created_at.desc())
        .all()
    )


@router.post("/packages/{package_id}/submit-review", response_model=DesignPackageOut)
def submit_review(
    project_id: uuid.UUID,
    package_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DesignPackage:
    require_project_access(user, db, project_id, role_design())
    p = db.get(DesignPackage, package_id)
    if not p or p.project_id != project_id:
        raise HTTPException(404)
    prev = p.status.value
    p.status = DesignPackageStatus.in_review
    log_transition(
        db,
        project_id=project_id,
        entity_type="design_package",
        entity_id=p.id,
        from_status=prev,
        to_status=p.status.value,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(p)
    return p


@router.post("/packages/{package_id}/approve-drawings", response_model=DesignPackageOut)
def approve_drawings(
    project_id: uuid.UUID,
    package_id: uuid.UUID,
    body: DesignApproveDrawing,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DesignPackage:
    require_project_access(user, db, project_id, role_design())
    p = db.get(DesignPackage, package_id)
    if not p or p.project_id != project_id:
        raise HTTPException(404)
    p.shop_drawing_approved = body.approved
    if p.shop_drawing_approved and p.calculation_approved:
        prev = p.status.value
        p.status = DesignPackageStatus.approved
        log_transition(
            db,
            project_id=project_id,
            entity_type="design_package",
            entity_id=p.id,
            from_status=prev,
            to_status=p.status.value,
            actor_id=user.id,
            reason="both_approved",
        )
    db.commit()
    db.refresh(p)
    return p


@router.post("/packages/{package_id}/approve-calculations", response_model=DesignPackageOut)
def approve_calculations(
    project_id: uuid.UUID,
    package_id: uuid.UUID,
    body: DesignApproveDrawing,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DesignPackage:
    require_project_access(user, db, project_id, role_design())
    p = db.get(DesignPackage, package_id)
    if not p or p.project_id != project_id:
        raise HTTPException(404)
    p.calculation_approved = body.approved
    if p.shop_drawing_approved and p.calculation_approved:
        prev = p.status.value
        p.status = DesignPackageStatus.approved
        log_transition(
            db,
            project_id=project_id,
            entity_type="design_package",
            entity_id=p.id,
            from_status=prev,
            to_status=p.status.value,
            actor_id=user.id,
            reason="both_approved",
        )
    db.commit()
    db.refresh(p)
    return p


@router.post("/change-orders", response_model=ChangeOrderOut)
def create_change_order(
    project_id: uuid.UUID,
    body: ChangeOrderCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ChangeOrder:
    require_project_access(user, db, project_id, role_design())
    if body.design_package_id:
        dp = db.get(DesignPackage, body.design_package_id)
        if not dp or dp.project_id != project_id or dp.status != DesignPackageStatus.approved:
            raise HTTPException(400, "Design package must be approved")
    co = ChangeOrder(
        project_id=project_id,
        reference=body.reference,
        request_kind=body.request_kind,
        design_package_id=body.design_package_id,
        boq_version_id=body.boq_version_id,
        status=ChangeOrderStatus.draft,
    )
    db.add(co)
    db.flush()
    log_transition(
        db,
        project_id=project_id,
        entity_type="change_order",
        entity_id=co.id,
        from_status=None,
        to_status=co.status.value,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(co)
    return co


@router.post("/change-orders/{co_id}/send-to-qs", response_model=ChangeOrderOut)
def send_to_qs(
    project_id: uuid.UUID,
    co_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ChangeOrder:
    require_project_access(user, db, project_id, role_design())
    co = db.get(ChangeOrder, co_id)
    if not co or co.project_id != project_id:
        raise HTTPException(404)
    co.request_kind = ChangeOrderRequestKind.quantity_variation
    prev = co.status.value
    co.status = ChangeOrderStatus.issued
    log_transition(
        db,
        project_id=project_id,
        entity_type="change_order",
        entity_id=co.id,
        from_status=prev,
        to_status=co.status.value,
        actor_id=user.id,
        reason="route_to_qs",
    )
    db.commit()
    db.refresh(co)
    return co


@router.post("/change-orders/{co_id}/send-to-contracts", response_model=ChangeOrderOut)
def send_to_contracts(
    project_id: uuid.UUID,
    co_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ChangeOrder:
    require_project_access(user, db, project_id, role_design())
    co = db.get(ChangeOrder, co_id)
    if not co or co.project_id != project_id:
        raise HTTPException(404)
    co.request_kind = ChangeOrderRequestKind.addition_new_item
    prev = co.status.value
    co.status = ChangeOrderStatus.issued
    log_transition(
        db,
        project_id=project_id,
        entity_type="change_order",
        entity_id=co.id,
        from_status=prev,
        to_status=co.status.value,
        actor_id=user.id,
        reason="route_to_contracts",
    )
    db.commit()
    db.refresh(co)
    return co


@router.post("/change-orders/{co_id}/issue", response_model=ChangeOrderOut)
def issue_co(
    project_id: uuid.UUID,
    co_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ChangeOrder:
    require_project_access(user, db, project_id, role_design())
    co = db.get(ChangeOrder, co_id)
    if not co or co.project_id != project_id:
        raise HTTPException(404)
    prev = co.status.value
    co.status = ChangeOrderStatus.issued
    log_transition(
        db,
        project_id=project_id,
        entity_type="change_order",
        entity_id=co.id,
        from_status=prev,
        to_status=co.status.value,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(co)
    return co


@router.get("/change-orders", response_model=list[ChangeOrderOut])
def list_cos(
    project_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[ChangeOrder]:
    require_project_access(user, db, project_id, role_design())
    return db.query(ChangeOrder).filter(ChangeOrder.project_id == project_id).all()
