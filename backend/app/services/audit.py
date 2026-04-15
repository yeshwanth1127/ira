import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.entities import WorkflowTransition


def log_transition(
    db: Session,
    *,
    project_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
    from_status: str | None,
    to_status: str,
    actor_id: uuid.UUID | None,
    reason: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> WorkflowTransition:
    row = WorkflowTransition(
        project_id=project_id,
        entity_type=entity_type,
        entity_id=entity_id,
        from_status=from_status,
        to_status=to_status,
        actor_id=actor_id,
        reason=reason,
        metadata_json=metadata,
    )
    db.add(row)
    return row
