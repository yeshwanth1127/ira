"""Pluggable ERP connectors; mock implementation for development."""

from __future__ import annotations

import uuid
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.models.entities import ErpJobStatus, ErpJobType, ErpSyncJob


class ErpConnector(Protocol):
    def push_boq_update(self, project_id: uuid.UUID, payload: dict[str, Any]) -> str: ...

    def record_variation(self, project_id: uuid.UUID, payload: dict[str, Any]) -> str: ...


class MockErpConnector:
    def push_boq_update(self, project_id: uuid.UUID, payload: dict[str, Any]) -> str:
        return f"mock-erp-boq-{project_id.hex[:8]}"

    def record_variation(self, project_id: uuid.UUID, payload: dict[str, Any]) -> str:
        return f"mock-erp-var-{project_id.hex[:8]}"


def get_connector(connector_key: str | None) -> ErpConnector:
    # Future: registry by connector_key from DB
    return MockErpConnector()


def run_erp_job(db: Session, job: ErpSyncJob) -> ErpSyncJob:
    from datetime import datetime, timezone

    conn = get_connector(job.connector_key)
    job.status = ErpJobStatus.running
    db.flush()
    try:
        if job.job_type == ErpJobType.update_boq:
            ref = conn.push_boq_update(job.project_id, job.payload or {})
        else:
            ref = conn.record_variation(job.project_id, job.payload or {})
        job.status = ErpJobStatus.succeeded
        job.external_ref = ref
        job.error_message = None
    except Exception as e:  # noqa: BLE001
        job.status = ErpJobStatus.failed
        job.error_message = str(e)
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return job
