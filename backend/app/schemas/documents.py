import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.entities import DocumentStatus


class ProjectDocumentCreate(BaseModel):
    document_number: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=512)


class ProjectDocumentPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    work_order_heading: str | None = Field(default=None, max_length=512)


class ProjectDocumentOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    document_number: str
    title: str
    work_order_heading: str | None = None
    quantity_variation_submitted_at: datetime | None = None
    status: DocumentStatus
    created_by_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RejectBody(BaseModel):
    reason: str | None = None


class ApproveBody(BaseModel):
    reason: str | None = None


class AttachmentOut(BaseModel):
    id: uuid.UUID
    filename: str
    entity_type: str
    entity_id: uuid.UUID
    size_bytes: int
    created_at: datetime
    attachment_slot: str | None = None

    model_config = {"from_attributes": True}
