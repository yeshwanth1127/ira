import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_project_access, role_contracts
from app.db.session import get_db
from app.models.entities import ErpConnectorConfig, ErpJobStatus, ErpSyncJob, Project, User, WorkOrder
from app.schemas.erp import ErpConnectorOut, ErpJobCreate, ErpJobOut, WorkOrderCreate, WorkOrderFlags, WorkOrderOut
from app.services.audit import log_transition
from app.services.erp_connector import run_erp_job

router = APIRouter(tags=["erp"])


@router.get("/erp/connectors", response_model=list[ErpConnectorOut])
def list_connectors(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[ErpConnectorConfig]:
    if not user.is_superuser:
        raise HTTPException(403)
    return db.query(ErpConnectorConfig).all()


@router.post("/projects/{project_id}/erp-jobs", response_model=ErpJobOut)
def enqueue_erp_job(
    project_id: uuid.UUID,
    body: ErpJobCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ErpSyncJob:
    require_project_access(user, db, project_id, role_contracts())
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(404)
    if body.idempotency_key:
        existing = (
            db.query(ErpSyncJob)
            .filter(
                ErpSyncJob.project_id == project_id,
                ErpSyncJob.idempotency_key == body.idempotency_key,
            )
            .first()
        )
        if existing:
            return existing
    job = ErpSyncJob(
        project_id=project_id,
        job_type=body.job_type,
        payload=body.payload,
        idempotency_key=body.idempotency_key,
        connector_key=p.erp_connector_key,
        status=ErpJobStatus.queued,
    )
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
    )
    db.commit()
    db.refresh(job)
    job = run_erp_job(db, job)
    return job


@router.get("/projects/{project_id}/erp-jobs", response_model=list[ErpJobOut])
def list_erp_jobs(
    project_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[ErpSyncJob]:
    require_project_access(user, db, project_id, None)
    return (
        db.query(ErpSyncJob)
        .filter(ErpSyncJob.project_id == project_id)
        .order_by(ErpSyncJob.created_at.desc())
        .all()
    )


@router.post("/projects/{project_id}/work-orders", response_model=WorkOrderOut)
def create_work_order(
    project_id: uuid.UUID,
    body: WorkOrderCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> WorkOrder:
    require_project_access(user, db, project_id, role_contracts())
    wo = WorkOrder(project_id=project_id, reference=body.reference)
    db.add(wo)
    db.flush()
    log_transition(
        db,
        project_id=project_id,
        entity_type="work_order",
        entity_id=wo.id,
        from_status=None,
        to_status="created",
        actor_id=user.id,
    )
    db.commit()
    db.refresh(wo)
    return wo


@router.patch("/projects/{project_id}/work-orders/{wo_id}", response_model=WorkOrderOut)
def update_work_order_flags(
    project_id: uuid.UUID,
    wo_id: uuid.UUID,
    body: WorkOrderFlags,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> WorkOrder:
    require_project_access(user, db, project_id, role_contracts())
    wo = db.get(WorkOrder, wo_id)
    if not wo or wo.project_id != project_id:
        raise HTTPException(404)
    if body.mail_received is not None:
        wo.mail_received = body.mail_received
    if body.work_order_received is not None:
        wo.work_order_received = body.work_order_received
    db.commit()
    db.refresh(wo)
    return wo


@router.get("/projects/{project_id}/work-orders", response_model=list[WorkOrderOut])
def list_work_orders(
    project_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[WorkOrder]:
    require_project_access(user, db, project_id, None)
    return db.query(WorkOrder).filter(WorkOrder.project_id == project_id).all()
