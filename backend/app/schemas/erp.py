import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.entities import ErpJobStatus, ErpJobType


class ErpJobCreate(BaseModel):
    job_type: ErpJobType
    payload: dict[str, Any] | None = None
    idempotency_key: str | None = Field(default=None, max_length=128)


class ErpJobOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    job_type: ErpJobType
    status: ErpJobStatus
    connector_key: str | None
    idempotency_key: str | None
    payload: dict[str, Any] | None = None
    external_ref: str | None
    error_message: str | None
    created_at: datetime
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class ErpConnectorOut(BaseModel):
    id: uuid.UUID
    connector_key: str
    label: str
    base_url: str | None
    is_mock: bool

    model_config = {"from_attributes": True}


class WorkOrderCreate(BaseModel):
    reference: str = Field(min_length=1, max_length=128)


class WorkOrderOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    reference: str
    mail_received: bool
    work_order_received: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkOrderFlags(BaseModel):
    mail_received: bool | None = None
    work_order_received: bool | None = None
