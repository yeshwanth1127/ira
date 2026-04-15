from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import get_settings, resolved_n8n_boq_callback_url
from app.core.deps import get_current_user
from app.models.entities import User

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/n8n-boq")
def get_n8n_boq_integration(
    _user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Callback URL and header name for n8n (shown on Contracts dashboard)."""
    url = resolved_n8n_boq_callback_url()
    return {
        "n8n_boq_callback_url": url,
        "n8n_boq_callback_configured": bool(url),
        "webhook_secret_header": "X-Webhook-Secret",
        "public_app_url": get_settings().public_app_url or None,
    }
