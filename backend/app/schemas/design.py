import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.entities import ChangeOrderRequestKind, ChangeOrderStatus, DesignPackageStatus


class DesignPackageCreate(BaseModel):
    label: str = Field(min_length=1, max_length=255)


class DesignPackageOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    label: str
    shop_drawing_approved: bool
    calculation_approved: bool
    status: DesignPackageStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class DesignApproveDrawing(BaseModel):
    approved: bool = True


class ChangeOrderCreate(BaseModel):
    reference: str = Field(min_length=1, max_length=128)
    design_package_id: uuid.UUID | None = None
    boq_version_id: uuid.UUID | None = None
    request_kind: ChangeOrderRequestKind | None = None


class ChangeOrderOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    design_package_id: uuid.UUID | None
    reference: str
    request_kind: ChangeOrderRequestKind | None = None
    boq_version_id: uuid.UUID | None
    status: ChangeOrderStatus
    created_at: datetime

    model_config = {"from_attributes": True}
