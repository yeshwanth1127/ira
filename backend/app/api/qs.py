import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_project_access, role_contracts, role_qs
from app.db.session import get_db
from app.models.entities import (
    ChangeOrder,
    ChangeOrderRequestKind,
    ErpJobStatus,
    ErpJobType,
    ErpSyncJob,
    QsComparisonRun,
    QsLineVariance,
    QsRunStatus,
    Project,
    User,
)
from app.schemas.qs import QsConfirmations, QsRunCreate, QsRunOut, QsVarianceOut
from app.schemas.design import ChangeOrderOut
from app.schemas.erp import ErpJobOut
from app.services.audit import log_transition
from app.services.qs_compare import run_qs_comparison

router = APIRouter(prefix="/projects/{project_id}/qs", tags=["qs"])


@router.get("/requests", response_model=list[ChangeOrderOut])
def list_quantity_variation_requests(
    project_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[ChangeOrder]:
    require_project_access(user, db, project_id, role_qs())
    return (
        db.query(ChangeOrder)
        .filter(
            ChangeOrder.project_id == project_id,
            ChangeOrder.request_kind == ChangeOrderRequestKind.quantity_variation,
        )
        .order_by(ChangeOrder.created_at.desc())
        .all()
    )


@router.post("/requests/{co_id}/send-to-contracts", response_model=ErpJobOut)
def send_request_to_contracts(
    project_id: uuid.UUID,
    co_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ErpSyncJob:
    require_project_access(user, db, project_id, role_qs())
    co = db.get(ChangeOrder, co_id)
    if not co or co.project_id != project_id:
        raise HTTPException(404)
    project = db.get(Project, project_id)
    job = ErpSyncJob(
        project_id=project_id,
        job_type=ErpJobType.record_variation,
        payload={
            "change_order_id": str(co.id),
            "change_order_reference": co.reference,
            "boq_version_id": str(co.boq_version_id) if co.boq_version_id else None,
            "request_kind": co.request_kind.value if co.request_kind else None,
        },
        status=ErpJobStatus.queued,
    )
    if project is not None:
        job.connector_key = project.erp_connector_key
    db.add(job)
    db.flush()
    log_transition(
        db,
        project_id=project_id,
        entity_type="erp_job",
        entity_id=job.id,
        from_status=None,
        to_status=job.status.value,
        actor_id=user.id,
        reason="qs_send_to_contracts",
        metadata={"change_order_id": str(co.id)},
    )
    db.commit()
    db.refresh(job)
    return job


@router.post("/runs", response_model=QsRunOut)
def create_run(
    project_id: uuid.UUID,
    body: QsRunCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> QsComparisonRun:
    require_project_access(user, db, project_id, role_qs())
    run = QsComparisonRun(
        project_id=project_id,
        baseline_boq_version_id=body.baseline_boq_version_id,
        target_boq_version_id=body.target_boq_version_id,
        status=QsRunStatus.draft,
    )
    db.add(run)
    db.flush()
    log_transition(
        db,
        project_id=project_id,
        entity_type="qs_run",
        entity_id=run.id,
        from_status=None,
        to_status=run.status.value,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(run)
    return run


@router.get("/runs", response_model=list[QsRunOut])
def list_runs(
    project_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[QsComparisonRun]:
    require_project_access(user, db, project_id, None)
    return (
        db.query(QsComparisonRun)
        .filter(QsComparisonRun.project_id == project_id)
        .order_by(QsComparisonRun.created_at.desc())
        .all()
    )


@router.post("/runs/{run_id}/compare", response_model=QsRunOut)
def execute_compare(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> QsComparisonRun:
    require_project_access(user, db, project_id, role_qs())
    run = db.get(QsComparisonRun, run_id)
    if not run or run.project_id != project_id:
        raise HTTPException(404)
    prev = run.status.value
    try:
        run = run_qs_comparison(db, run)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    log_transition(
        db,
        project_id=project_id,
        entity_type="qs_run",
        entity_id=run.id,
        from_status=prev,
        to_status=run.status.value,
        actor_id=user.id,
        reason="compare_executed",
    )
    db.commit()
    db.refresh(run)
    return run


@router.get("/runs/{run_id}/variances", response_model=list[QsVarianceOut])
def list_variances(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=2000)] = 500,
) -> list[QsLineVariance]:
    require_project_access(user, db, project_id, None)
    run = db.get(QsComparisonRun, run_id)
    if not run or run.project_id != project_id:
        raise HTTPException(404)
    return (
        db.query(QsLineVariance)
        .filter(QsLineVariance.qs_run_id == run_id)
        .order_by(QsLineVariance.line_no)
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post("/runs/{run_id}/confirmations", response_model=QsRunOut)
def set_confirmations(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    body: QsConfirmations,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> QsComparisonRun:
    require_project_access(user, db, project_id, role_qs())
    run = db.get(QsComparisonRun, run_id)
    if not run or run.project_id != project_id:
        raise HTTPException(404)
    if body.mail_confirmed is not None:
        run.mail_confirmed = body.mail_confirmed
    if body.work_order_received is not None:
        run.work_order_received = body.work_order_received
    if run.mail_confirmed and run.work_order_received:
        prev = run.status.value
        run.status = QsRunStatus.complete
        log_transition(
            db,
            project_id=project_id,
            entity_type="qs_run",
            entity_id=run.id,
            from_status=prev,
            to_status=run.status.value,
            actor_id=user.id,
        )
    elif run.status == QsRunStatus.compared:
        run.status = QsRunStatus.awaiting_confirmations
    db.commit()
    db.refresh(run)
    return run
