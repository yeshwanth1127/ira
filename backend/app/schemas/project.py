import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.entities import BoqSource, BoqVersionStatus, CustomerApprovalStatus, DepartmentRole


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=64)
    erp_connector_key: str | None = None


class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    erp_connector_key: str | None

    model_config = {"from_attributes": True}


class ProjectSummary(BaseModel):
    project: ProjectOut
    boq_versions_count: int
    latest_document_status: str | None
    open_erp_jobs: int


class MembershipAssign(BaseModel):
    user_id: uuid.UUID
    role: DepartmentRole


class BoqVersionCreate(BaseModel):
    label: str
    source: BoqSource


class BoqVersionOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    label: str
    source: BoqSource
    status: BoqVersionStatus
    row_count_snapshot: int | None
    form_project_name: str | None = None
    cluster_head: str | None = None
    client_name: str | None = None
    source_filename: str | None = None
    customer_approval_status: CustomerApprovalStatus
    customer_approval_note: str | None = None
    customer_submitted_for_approval_at: datetime | None = None
    customer_approval_decided_at: datetime | None = None
    created_at: datetime
    locked_at: datetime | None

    model_config = {"from_attributes": True}


class BoqLineOut(BaseModel):
    id: uuid.UUID
    line_no: str
    description: str
    uom: str | None
    quantity: float
    rate: float
    amount: float
    sort_order: int

    model_config = {"from_attributes": True}


class BoqLineUpdate(BaseModel):
    id: uuid.UUID
    line_no: str
    description: str
    uom: str | None = None
    quantity: float
    rate: float
    amount: float
    sort_order: int


class BoqLineUpdatePage(BaseModel):
    items: list[BoqLineUpdate]


class BoqLinePage(BaseModel):
    items: list[BoqLineOut]
    next_cursor: str | None
    total_count: int


class ApprovedBoqProjectGroup(BaseModel):
    project: ProjectOut
    versions: list[BoqVersionOut]
