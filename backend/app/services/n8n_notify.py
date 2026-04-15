import logging

import httpx

from app.core.config import get_settings, resolved_n8n_boq_callback_url
from app.models.entities import BoqVersion, Project

logger = logging.getLogger(__name__)


def notify_n8n_boq_submitted(boq: BoqVersion, project: Project) -> None:
    """POST to n8n when a BOQ enters customer approval (pending). No-op if URL not configured."""
    settings = get_settings()
    url = settings.n8n_boq_submitted_webhook_url
    if not url:
        return
    callback_url = resolved_n8n_boq_callback_url()
    if not callback_url:
        logger.warning(
            "Skipping n8n notify payload: set N8N_BOQ_CALLBACK_URL (or PUBLIC_APP_URL) so the workflow knows where to POST approvals"
        )
        return
    payload = {
        "event": "boq_submitted_for_customer_approval",
        "boq_version_id": str(boq.id),
        "project_id": str(project.id),
        "project_name": project.name,
        "project_code": project.code,
        "form_project_name": boq.form_project_name,
        "cluster_head": boq.cluster_head,
        "client_name": boq.client_name,
        "boq_label": boq.label,
        "callback": {
            "url": callback_url,
            "secret_header_name": "X-Webhook-Secret",
        },
    }
    try:
        r = httpx.post(url, json=payload, timeout=30.0)
        r.raise_for_status()
    except Exception as e:
        logger.warning("n8n notify failed for BOQ %s: %s", boq.id, e)
