import mimetypes
import uuid
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_project_access, role_contracts, role_contracts_qs_read
from app.db.session import get_db
from app.models.entities import BoqLineItem, BoqVersion, BoqVersionStatus, CustomerApprovalStatus, User, utcnow
from app.schemas.project import BoqLineOut, BoqLinePage, BoqLineUpdatePage, BoqVersionOut
from app.services.audit import log_transition
from app.services.boq_import import import_boq_from_xlsx, lock_boq_version
from app.services.design_handoff import ensure_design_handoff_document

router = APIRouter(prefix="/boq-versions", tags=["boq"])


@router.get("/{version_id}", response_model=BoqVersionOut)
def get_version(
    version_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> BoqVersion:
    v = db.get(BoqVersion, version_id)
    if not v:
        raise HTTPException(404)
    require_project_access(user, db, v.project_id, role_contracts_qs_read())
    return v


@router.post("/{version_id}/import", response_model=dict)
async def import_xlsx(
    version_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> dict:
    v = db.get(BoqVersion, version_id)
    if not v:
        raise HTTPException(404)
    require_project_access(user, db, v.project_id, role_contracts())
    data = await file.read()
    try:
        count, errors = import_boq_from_xlsx(db, v, data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    fname = (file.filename or v.source_filename or "boq.xlsx").strip() or "boq.xlsx"
    boq_key = make_storage_key(v.project_id, fname)
    ct = mimetypes.guess_type(fname)[0] or "application/octet-stream"
    upload_fileobj(BytesIO(data), boq_key, ct)
    v.source_storage_key = boq_key
    log_transition(
        db,
        project_id=v.project_id,
        entity_type="boq_version",
        entity_id=v.id,
        from_status=v.status.value,
        to_status=v.status.value,
        actor_id=user.id,
        reason="boq_import",
        metadata={"rows_imported": count, "errors": errors},
    )
    db.commit()
    return {"rows_imported": count, "errors": errors}


@router.get("/{version_id}/lines", response_model=BoqLinePage)
def list_lines(
    version_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    cursor: Annotated[int | None, Query(ge=0)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> BoqLinePage:
    v = db.get(BoqVersion, version_id)
    if not v:
        raise HTTPException(404)
    require_project_access(user, db, v.project_id, role_contracts_qs_read())
    offset = cursor or 0
    q = db.query(BoqLineItem).filter(BoqLineItem.boq_version_id == version_id).order_by(BoqLineItem.sort_order)
    total = q.count()
    items = q.offset(offset).limit(limit + 1).all()
    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = str(offset + limit)
    return BoqLinePage(
        items=[BoqLineOut.model_validate(x) for x in items],
        next_cursor=next_cursor,
        total_count=total,
    )


@router.put("/{version_id}/lines", response_model=BoqLinePage)
def update_lines(
    version_id: uuid.UUID,
    body: BoqLineUpdatePage,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> BoqLinePage:
    v = db.get(BoqVersion, version_id)
    if not v:
        raise HTTPException(404)
    require_project_access(user, db, v.project_id, role_contracts())
    updated_items: list[BoqLineItem] = []
    for row in body.items:
        item = db.get(BoqLineItem, row.id)
        if not item or item.boq_version_id != version_id:
            raise HTTPException(404, detail=f"BOQ line not found: {row.id}")
        item.line_no = row.line_no.strip()
        item.description = row.description.strip()
        item.uom = row.uom.strip() if row.uom and row.uom.strip() else None
        item.quantity = row.quantity
        item.rate = row.rate
        item.amount = row.amount
        item.sort_order = row.sort_order
        updated_items.append(item)
    db.commit()
    total = (
        db.query(BoqLineItem)
        .filter(BoqLineItem.boq_version_id == version_id)
        .count()
    )
    return BoqLinePage(
        items=[BoqLineOut.model_validate(item) for item in updated_items],
        next_cursor=None,
        total_count=total,
    )


@router.post("/{version_id}/lock", response_model=BoqVersionOut)
def lock_version(
    version_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> BoqVersion:
    v = db.get(BoqVersion, version_id)
    if not v:
        raise HTTPException(404)
    require_project_access(user, db, v.project_id, role_contracts())
    prev = v.status.value
    v = lock_boq_version(db, v, user.id)
    log_transition(
        db,
        project_id=v.project_id,
        entity_type="boq_version",
        entity_id=v.id,
        from_status=prev,
        to_status=v.status.value,
        actor_id=user.id,
        metadata={"row_count": v.row_count_snapshot},
    )
    db.commit()
    return v


@router.post("/{version_id}/poc-approve-client", response_model=BoqVersionOut)
def poc_approve_client(
    version_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> BoqVersion:
    """POC: record client approval from Contracts (same pattern as /lock — no project id in path)."""
    v = db.get(BoqVersion, version_id)
    if not v:
        raise HTTPException(404, detail="BOQ version not found")
    require_project_access(user, db, v.project_id, role_contracts())
    if v.customer_approval_status != CustomerApprovalStatus.pending:
        raise HTTPException(400, detail="BOQ is not awaiting client approval")
    v.customer_approval_status = CustomerApprovalStatus.approved
    v.customer_approval_note = "POC: approved via Contracts dashboard"
    v.customer_approval_decided_at = utcnow()
    log_transition(
        db,
        project_id=v.project_id,
        entity_type="boq_version",
        entity_id=v.id,
        from_status=CustomerApprovalStatus.pending.value,
        to_status=CustomerApprovalStatus.approved.value,
        actor_id=user.id,
        reason="poc_contracts_dashboard_client_approve",
        metadata={},
    )
    ensure_design_handoff_document(db, v, actor_id=user.id)
    db.commit()
    db.refresh(v)
    return v
