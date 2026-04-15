import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import BoqVersion, CustomerApprovalStatus
from app.schemas.webhook import N8nCustomerBoqApprovalBody
from app.services.audit import log_transition
from app.services.design_handoff import ensure_design_handoff_document
from app.core.config import get_settings

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
# Top-level routes so n8n can POST to /api/approval (matches PUBLIC_APP_URL + /api/approval behind reverse proxies)
approval_router = APIRouter(tags=["webhooks"])

_STATUS_MAP = {
    "approved": CustomerApprovalStatus.approved,
    "rejected": CustomerApprovalStatus.rejected,
    "changes_requested": CustomerApprovalStatus.changes_requested,
}


def process_n8n_customer_boq_approval(
    body: N8nCustomerBoqApprovalBody,
    db: Session,
    x_webhook_secret: str | None,
) -> dict:
    settings = get_settings()
    expected = settings.customer_approval_webhook_secret.encode()
    got = (x_webhook_secret or "").encode()
    if not secrets.compare_digest(got, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    v = db.get(BoqVersion, body.boq_version_id)
    if not v:
        raise HTTPException(status_code=404, detail="BOQ version not found")

    if v.customer_approval_status != CustomerApprovalStatus.pending:
        raise HTTPException(
            status_code=409,
            detail="BOQ is not awaiting customer approval",
        )

    new_status = _STATUS_MAP[body.status]
    v.customer_approval_status = new_status
    v.customer_approval_note = body.note
    from app.models.entities import utcnow

    v.customer_approval_decided_at = utcnow()

    log_transition(
        db,
        project_id=v.project_id,
        entity_type="boq_version",
        entity_id=v.id,
        from_status="pending_customer_approval",
        to_status=new_status.value,
        actor_id=None,
        reason="n8n_customer_approval_webhook",
        metadata={"note": body.note},
    )
    if new_status == CustomerApprovalStatus.approved:
        ensure_design_handoff_document(db, v, actor_id=None)
    db.commit()
    return {
        "ok": True,
        "boq_version_id": str(v.id),
        "customer_approval_status": new_status.value,
    }


@router.post("/n8n/customer-boq-approval")
def receive_n8n_customer_boq_approval(
    body: N8nCustomerBoqApprovalBody,
    db: Annotated[Session, Depends(get_db)],
    x_webhook_secret: Annotated[str | None, Header()] = None,
) -> dict:
    return process_n8n_customer_boq_approval(body, db, x_webhook_secret)


@approval_router.post("/approval")
def receive_boq_approval_root(
    body: N8nCustomerBoqApprovalBody,
    db: Annotated[Session, Depends(get_db)],
    x_webhook_secret: Annotated[str | None, Header()] = None,
) -> dict:
    return process_n8n_customer_boq_approval(body, db, x_webhook_secret)


@approval_router.post("/api/approval")
def receive_boq_approval_api_prefix(
    body: N8nCustomerBoqApprovalBody,
    db: Annotated[Session, Depends(get_db)],
    x_webhook_secret: Annotated[str | None, Header()] = None,
) -> dict:
    """Same handler as /approval — use the URL configured as N8N_BOQ_CALLBACK_URL (often …/api/approval)."""
    return process_n8n_customer_boq_approval(body, db, x_webhook_secret)
