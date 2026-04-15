"""Celery app for background ERP retries and bulk BOQ imports (optional).

Run worker: celery -A app.worker.celery_app worker -l info
"""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()
celery_app = Celery(
    "alufit",
    broker=settings.redis_url,
    backend=settings.redis_url,
)


@celery_app.task(name="erp.process_job")
def process_erp_job(job_id: str) -> None:
    """Placeholder: load ErpSyncJob by id and call run_erp_job."""
    import uuid

    from sqlalchemy.orm import Session

    from app.db.session import SessionLocal
    from app.models.entities import ErpSyncJob
    from app.services.erp_connector import run_erp_job

    db: Session = SessionLocal()
    try:
        job = db.get(ErpSyncJob, uuid.UUID(job_id))
        if job:
            run_erp_job(db, job)
    finally:
        db.close()
