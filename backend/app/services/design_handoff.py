import uuid

from sqlalchemy.orm import Session

from app.models.entities import BoqVersion, DepartmentRole, Project, ProjectDocument, ProjectMembership, User


def ensure_design_handoff_document(
    db: Session,
    boq_version: BoqVersion,
    actor_id: uuid.UUID | None,
) -> ProjectDocument | None:
    """Create or return a Design-side project document for an approved BOQ.

    This keeps the handoff automatic: once BOQ is approved, Design dashboard has a linked
    document row ready for attachments and remarks.
    """
    existing = (
        db.query(ProjectDocument)
        .filter(
            ProjectDocument.project_id == boq_version.project_id,
            ProjectDocument.work_order_heading == (boq_version.form_project_name or boq_version.label),
        )
        .order_by(ProjectDocument.created_at.desc())
        .first()
    )
    if existing:
        return existing

    creator_id = actor_id
    if creator_id is None:
        design_member = (
            db.query(ProjectMembership)
            .filter(
                ProjectMembership.project_id == boq_version.project_id,
                ProjectMembership.role.in_([DepartmentRole.design, DepartmentRole.admin]),
            )
            .order_by(ProjectMembership.id.asc())
            .first()
        )
        if design_member:
            creator_id = design_member.user_id
        else:
            any_member = (
                db.query(ProjectMembership)
                .filter(ProjectMembership.project_id == boq_version.project_id)
                .order_by(ProjectMembership.id.asc())
                .first()
            )
            if any_member:
                creator_id = any_member.user_id

    if creator_id is None:
        fallback_user = db.query(User).order_by(User.created_at.asc()).first()
        if not fallback_user:
            return None
        creator_id = fallback_user.id

    project = db.get(Project, boq_version.project_id)
    project_code = project.code if project else "PRJ"
    doc_no = f"DOC-{project_code}-{str(boq_version.id)[:8]}"
    title = (boq_version.client_name or boq_version.form_project_name or boq_version.label or "Approved BOQ").strip()

    doc = ProjectDocument(
        project_id=boq_version.project_id,
        document_number=doc_no[:128],
        title=title[:512],
        work_order_heading=(boq_version.form_project_name or boq_version.label or None),
        created_by_id=creator_id,
    )
    db.add(doc)
    db.flush()
    return doc
