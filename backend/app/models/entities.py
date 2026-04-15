from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def utcnow() -> datetime:
    return datetime.now(timezone.utc)

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class DepartmentRole(str, enum.Enum):
    contracts = "contracts"
    design = "design"
    qs = "qs"
    admin = "admin"


class BoqSource(str, enum.Enum):
    new_boq = "new_boq"
    existing_boq = "existing_boq"


class BoqVersionStatus(str, enum.Enum):
    draft = "draft"
    locked = "locked"


class DocumentStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    rejected = "rejected"
    approved = "approved"
    intimated = "intimated"


class DesignPackageStatus(str, enum.Enum):
    draft = "draft"
    in_review = "in_review"
    changes_requested = "changes_requested"
    approved = "approved"


class ChangeOrderStatus(str, enum.Enum):
    draft = "draft"
    issued = "issued"
    acknowledged_by_qs = "acknowledged_by_qs"


class ChangeOrderRequestKind(str, enum.Enum):
    quantity_variation = "quantity_variation"
    addition_new_item = "addition_new_item"


class QsRunStatus(str, enum.Enum):
    draft = "draft"
    compared = "compared"
    awaiting_confirmations = "awaiting_confirmations"
    complete = "complete"


class ErpJobType(str, enum.Enum):
    update_boq = "update_boq"
    record_variation = "record_variation"


class ErpJobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class CustomerApprovalStatus(str, enum.Enum):
    not_sent = "not_sent"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    changes_requested = "changes_requested"


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_role: Mapped[DepartmentRole] = mapped_column(Enum(DepartmentRole), nullable=False, default=DepartmentRole.contracts)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    memberships: Mapped[List["ProjectMembership"]] = relationship(back_populates="user")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    erp_connector_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    organization: Mapped["Organization"] = relationship()
    memberships: Mapped[List["ProjectMembership"]] = relationship(back_populates="project")
    boq_versions: Mapped[List["BoqVersion"]] = relationship(back_populates="project")


class ProjectMembership(Base):
    __tablename__ = "project_memberships"
    __table_args__ = (UniqueConstraint("user_id", "project_id", name="uq_user_project"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    role: Mapped[DepartmentRole] = mapped_column(Enum(DepartmentRole), nullable=False)

    user: Mapped["User"] = relationship(back_populates="memberships")
    project: Mapped["Project"] = relationship(back_populates="memberships")


class BoqVersion(Base):
    __tablename__ = "boq_versions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[BoqSource] = mapped_column(Enum(BoqSource), nullable=False)
    status: Mapped[BoqVersionStatus] = mapped_column(
        Enum(BoqVersionStatus), nullable=False, default=BoqVersionStatus.draft
    )
    row_count_snapshot: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    form_project_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cluster_head: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    client_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_filename: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    # Storage key for the uploaded BOQ file (local or S3), for email attachment / audit
    source_storage_key: Mapped[Optional[str]] = mapped_column(String(768), nullable=True)
    customer_approval_status: Mapped[CustomerApprovalStatus] = mapped_column(
        Enum(CustomerApprovalStatus),
        nullable=False,
        default=CustomerApprovalStatus.not_sent,
    )
    customer_approval_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_submitted_for_approval_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    customer_approval_decided_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="boq_versions")
    line_items: Mapped[List["BoqLineItem"]] = relationship(
        back_populates="boq_version", order_by="BoqLineItem.sort_order"
    )


class BoqLineItem(Base):
    __tablename__ = "boq_line_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    boq_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("boq_versions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_no: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    uom: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    rate: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    amount: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    boq_version: Mapped["BoqVersion"] = relationship(back_populates="line_items")


class ProjectDocument(Base):
    __tablename__ = "project_documents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True
    )
    document_number: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    work_order_heading: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    quantity_variation_submitted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus), nullable=False, default=DocumentStatus.draft
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    content_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    # For project_document attachments: calculation | shop_drawing | null (legacy)
    attachment_slot: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DesignPackage(Base):
    __tablename__ = "design_packages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    shop_drawing_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    calculation_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[DesignPackageStatus] = mapped_column(
        Enum(DesignPackageStatus), nullable=False, default=DesignPackageStatus.draft
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ChangeOrder(Base):
    __tablename__ = "change_orders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True
    )
    design_package_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("design_packages.id"), nullable=True
    )
    reference: Mapped[str] = mapped_column(String(128), nullable=False)
    request_kind: Mapped[Optional[ChangeOrderRequestKind]] = mapped_column(
        Enum(ChangeOrderRequestKind), nullable=True
    )
    boq_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("boq_versions.id"), nullable=True
    )
    status: Mapped[ChangeOrderStatus] = mapped_column(
        Enum(ChangeOrderStatus), nullable=False, default=ChangeOrderStatus.draft
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QsComparisonRun(Base):
    __tablename__ = "qs_comparison_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True
    )
    baseline_boq_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("boq_versions.id"), nullable=False
    )
    target_boq_version_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("boq_versions.id"), nullable=False
    )
    status: Mapped[QsRunStatus] = mapped_column(
        Enum(QsRunStatus), nullable=False, default=QsRunStatus.draft
    )
    mail_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    work_order_received: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    variances: Mapped[List["QsLineVariance"]] = relationship(back_populates="qs_run")


class QsLineVariance(Base):
    __tablename__ = "qs_line_variances"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    qs_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("qs_comparison_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    line_no: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    initial_qty: Mapped[float] = mapped_column(Float, nullable=False)
    current_qty: Mapped[float] = mapped_column(Float, nullable=False)
    initial_rate: Mapped[float] = mapped_column(Float, nullable=False)
    current_rate: Mapped[float] = mapped_column(Float, nullable=False)
    variation_amount: Mapped[float] = mapped_column(Float, nullable=False)

    qs_run: Mapped["QsComparisonRun"] = relationship(back_populates="variances")


class ErpConnectorConfig(Base):
    __tablename__ = "erp_connector_configs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    connector_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    credentials_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_mock: Mapped[bool] = mapped_column(Boolean, default=True)


class ErpSyncJob(Base):
    __tablename__ = "erp_sync_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True
    )
    job_type: Mapped[ErpJobType] = mapped_column(Enum(ErpJobType), nullable=False)
    status: Mapped[ErpJobStatus] = mapped_column(
        Enum(ErpJobStatus), nullable=False, default=ErpJobStatus.queued
    )
    connector_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    external_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class WorkOrder(Base):
    __tablename__ = "work_orders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True
    )
    reference: Mapped[str] = mapped_column(String(128), nullable=False)
    mail_received: Mapped[bool] = mapped_column(Boolean, default=False)
    work_order_received: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkflowTransition(Base):
    __tablename__ = "workflow_transitions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=_uuid)
    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    from_status: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    to_status: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
