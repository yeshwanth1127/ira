import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user, require_project_access
from app.db.session import get_db
from app.models.entities import Attachment, DocumentStatus, ProjectDocument, User, utcnow
from app.schemas.documents import (
    ApproveBody,
    AttachmentOut,
    ProjectDocumentCreate,
    ProjectDocumentOut,
    ProjectDocumentPatch,
    RejectBody,
)
from app.services.audit import log_transition
from app.services.storage import make_storage_key, presigned_get_url, resolve_local_storage_key, upload_fileobj

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["documents"])


def _doc_access(user: User, db: Session, project_id: uuid.UUID, doc: ProjectDocument) -> None:
    if doc.project_id != project_id:
        raise HTTPException(404)
    require_project_access(user, db, project_id, None)


@router.post("", response_model=ProjectDocumentOut)
def create_document(
    project_id: uuid.UUID,
    body: ProjectDocumentCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ProjectDocument:
    require_project_access(user, db, project_id, None)
    d = ProjectDocument(
        project_id=project_id,
        document_number=body.document_number,
        title=body.title,
        status=DocumentStatus.draft,
        created_by_id=user.id,
    )
    db.add(d)
    db.flush()
    log_transition(
        db,
        project_id=project_id,
        entity_type="project_document",
        entity_id=d.id,
        from_status=None,
        to_status=d.status.value,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(d)
    return d


@router.patch("/{document_id}", response_model=ProjectDocumentOut)
def patch_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    body: ProjectDocumentPatch,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ProjectDocument:
    d = db.get(ProjectDocument, document_id)
    if not d or d.project_id != project_id:
        raise HTTPException(404)
    _doc_access(user, db, project_id, d)
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(400, "No fields to update")
    if "title" in patch:
        d.title = patch["title"].strip()
    if "work_order_heading" in patch:
        t = (patch["work_order_heading"] or "").strip()
        d.work_order_heading = t if t else None
    db.commit()
    db.refresh(d)
    return d


@router.post(
    "/{document_id}/submit-quantity-variation-to-qs",
    response_model=ProjectDocumentOut,
)
def submit_quantity_variation_to_qs(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ProjectDocument:
    """Design team marks quantity variation as sent to QS; stays on Design side (no redirect)."""
    d = db.get(ProjectDocument, document_id)
    if not d or d.project_id != project_id:
        raise HTTPException(404)
    _doc_access(user, db, project_id, d)
    now = utcnow()
    if d.quantity_variation_submitted_at is None:
        d.quantity_variation_submitted_at = now
        log_transition(
            db,
            project_id=project_id,
            entity_type="project_document",
            entity_id=d.id,
            from_status=d.status.value,
            to_status=d.status.value,
            actor_id=user.id,
            reason="quantity_variation_submitted_to_qs",
            metadata={"submitted_at": now.isoformat()},
        )
    db.commit()
    db.refresh(d)
    return d


@router.get("", response_model=list[ProjectDocumentOut])
def list_documents(
    project_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[ProjectDocument]:
    require_project_access(user, db, project_id, None)
    return (
        db.query(ProjectDocument)
        .filter(ProjectDocument.project_id == project_id)
        .order_by(ProjectDocument.created_at.desc())
        .all()
    )


@router.post("/{document_id}/submit", response_model=ProjectDocumentOut)
def submit_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ProjectDocument:
    d = db.get(ProjectDocument, document_id)
    if not d:
        raise HTTPException(404)
    _doc_access(user, db, project_id, d)
    if d.status != DocumentStatus.draft and d.status != DocumentStatus.rejected:
        raise HTTPException(400, "Invalid state for submit")
    prev = d.status.value
    d.status = DocumentStatus.submitted
    log_transition(
        db,
        project_id=project_id,
        entity_type="project_document",
        entity_id=d.id,
        from_status=prev,
        to_status=d.status.value,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(d)
    return d


@router.post("/{document_id}/reject", response_model=ProjectDocumentOut)
def reject_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    body: RejectBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ProjectDocument:
    d = db.get(ProjectDocument, document_id)
    if not d:
        raise HTTPException(404)
    _doc_access(user, db, project_id, d)
    if d.status != DocumentStatus.submitted:
        raise HTTPException(400, "Can only reject submitted documents")
    prev = d.status.value
    d.status = DocumentStatus.rejected
    log_transition(
        db,
        project_id=project_id,
        entity_type="project_document",
        entity_id=d.id,
        from_status=prev,
        to_status=d.status.value,
        actor_id=user.id,
        reason=body.reason,
    )
    db.commit()
    db.refresh(d)
    return d


@router.post("/{document_id}/approve", response_model=ProjectDocumentOut)
def approve_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    body: ApproveBody,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ProjectDocument:
    d = db.get(ProjectDocument, document_id)
    if not d:
        raise HTTPException(404)
    _doc_access(user, db, project_id, d)
    if d.status != DocumentStatus.submitted:
        raise HTTPException(400, "Can only approve submitted documents")
    prev = d.status.value
    d.status = DocumentStatus.approved
    log_transition(
        db,
        project_id=project_id,
        entity_type="project_document",
        entity_id=d.id,
        from_status=prev,
        to_status=d.status.value,
        actor_id=user.id,
        reason=body.reason,
    )
    db.commit()
    db.refresh(d)
    return d


@router.post("/{document_id}/intimate", response_model=ProjectDocumentOut)
def intimate_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> ProjectDocument:
    d = db.get(ProjectDocument, document_id)
    if not d:
        raise HTTPException(404)
    _doc_access(user, db, project_id, d)
    if d.status != DocumentStatus.approved:
        raise HTTPException(400, "Must be approved first")
    prev = d.status.value
    d.status = DocumentStatus.intimated
    log_transition(
        db,
        project_id=project_id,
        entity_type="project_document",
        entity_id=d.id,
        from_status=prev,
        to_status=d.status.value,
        actor_id=user.id,
    )
    db.commit()
    db.refresh(d)
    return d


@router.get("/{document_id}/attachments", response_model=list[AttachmentOut])
def list_document_attachments(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> list[Attachment]:
    d = db.get(ProjectDocument, document_id)
    if not d or d.project_id != project_id:
        raise HTTPException(404)
    _doc_access(user, db, project_id, d)
    return (
        db.query(Attachment)
        .filter(
            Attachment.project_id == project_id,
            Attachment.entity_type == "project_document",
            Attachment.entity_id == document_id,
        )
        .order_by(Attachment.created_at.desc())
        .all()
    )


@router.post("/{document_id}/attachments", response_model=AttachmentOut)
async def upload_attachment(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
    attachment_slot: Annotated[str | None, Form()] = None,
) -> Attachment:
    d = db.get(ProjectDocument, document_id)
    if not d or d.project_id != project_id:
        raise HTTPException(404)
    if attachment_slot is not None and attachment_slot not in ("calculation", "shop_drawing"):
        raise HTTPException(400, "attachment_slot must be calculation or shop_drawing")
    require_project_access(user, db, project_id, None)
    key = make_storage_key(project_id, file.filename or "file")
    data = await file.read()
    from io import BytesIO

    content_type = (file.content_type or "").strip() or "application/octet-stream"
    upload_fileobj(BytesIO(data), key, content_type)
    att = Attachment(
        project_id=project_id,
        filename=file.filename or "file",
        storage_key=key,
        content_type=content_type,
        size_bytes=len(data),
        uploaded_by_id=user.id,
        entity_type="project_document",
        entity_id=document_id,
        attachment_slot=attachment_slot,
    )
    db.add(att)
    db.flush()
    log_transition(
        db,
        project_id=project_id,
        entity_type="attachment",
        entity_id=att.id,
        from_status=None,
        to_status="uploaded",
        actor_id=user.id,
        metadata={
            "filename": att.filename,
            "document_id": str(document_id),
            "attachment_slot": attachment_slot,
        },
    )
    db.commit()
    db.refresh(att)
    return att


@router.get("/{document_id}/attachments/{attachment_id}/download")
def download_attachment(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    d = db.get(ProjectDocument, document_id)
    if not d or d.project_id != project_id:
        raise HTTPException(404)
    _doc_access(user, db, project_id, d)
    att = db.get(Attachment, attachment_id)
    if (
        not att
        or att.project_id != project_id
        or att.entity_type != "project_document"
        or att.entity_id != document_id
    ):
        raise HTTPException(404)

    s = get_settings()
    if s.storage_backend == "local":
        path = resolve_local_storage_key(att.storage_key)
        if not path.exists():
            raise HTTPException(404, "Attachment file missing in storage")
        media_type = att.content_type or "application/octet-stream"
        return FileResponse(path, media_type=media_type, filename=att.filename)

    url = presigned_get_url(att.storage_key)
    return RedirectResponse(url)
