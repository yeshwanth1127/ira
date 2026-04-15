import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_project_access
from app.db.session import get_db
from app.models.entities import User, WorkflowTransition
from app.schemas.activity import WorkflowTransitionOut

router = APIRouter(prefix="/projects/{project_id}/activity", tags=["activity"])


@router.get("", response_model=list[WorkflowTransitionOut])
def list_activity(
    project_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    entity_type: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=2000)] = 200,
) -> list[WorkflowTransition]:
    require_project_access(user, db, project_id, None)
    q = db.query(WorkflowTransition).filter(WorkflowTransition.project_id == project_id)
    if entity_type:
        q = q.filter(WorkflowTransition.entity_type == entity_type)
    return q.order_by(WorkflowTransition.created_at.desc()).limit(limit).all()


@router.get("/export.csv")
def export_activity_csv(
    project_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    require_project_access(user, db, project_id, None)
    rows = (
        db.query(WorkflowTransition)
        .filter(WorkflowTransition.project_id == project_id)
        .order_by(WorkflowTransition.created_at.asc())
        .all()
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        ["created_at", "entity_type", "entity_id", "from_status", "to_status", "actor_id", "reason"]
    )
    for r in rows:
        w.writerow(
            [
                r.created_at.isoformat() if r.created_at else "",
                r.entity_type,
                str(r.entity_id),
                r.from_status or "",
                r.to_status,
                str(r.actor_id) if r.actor_id else "",
                (r.reason or "").replace("\n", " "),
            ]
        )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="activity-{project_id}-{datetime.now(timezone.utc).date()}.csv"'
        },
    )
