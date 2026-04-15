import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.entities import QsRunStatus


class QsRunCreate(BaseModel):
    baseline_boq_version_id: uuid.UUID
    target_boq_version_id: uuid.UUID


class QsRunOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    baseline_boq_version_id: uuid.UUID
    target_boq_version_id: uuid.UUID
    status: QsRunStatus
    mail_confirmed: bool
    work_order_received: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class QsVarianceOut(BaseModel):
    id: uuid.UUID
    line_no: str
    description: str
    initial_qty: float
    current_qty: float
    initial_rate: float
    current_rate: float
    variation_amount: float

    model_config = {"from_attributes": True}


class QsConfirmations(BaseModel):
    mail_confirmed: Optional[bool] = None
    work_order_received: Optional[bool] = None
