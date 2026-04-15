import uuid
from typing import Literal

from pydantic import BaseModel, Field


class N8nCustomerBoqApprovalBody(BaseModel):
    boq_version_id: uuid.UUID
    status: Literal["approved", "rejected", "changes_requested"]
    note: str | None = Field(default=None, max_length=4000)
