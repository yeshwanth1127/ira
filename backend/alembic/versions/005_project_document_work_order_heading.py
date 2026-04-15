"""project_documents.work_order_heading for Design sheet

Revision ID: 005_project_document_work_order_heading
Revises: 004_attachment_slot
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005_project_document_work_order_heading"
down_revision: Union[str, None] = "004_attachment_slot"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_documents", sa.Column("work_order_heading", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("project_documents", "work_order_heading")
