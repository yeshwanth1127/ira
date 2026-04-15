import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class WorkflowTransitionOut(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    from_status: str | None
    to_status: str
    actor_id: uuid.UUID | None
    reason: str | None
    metadata_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}
