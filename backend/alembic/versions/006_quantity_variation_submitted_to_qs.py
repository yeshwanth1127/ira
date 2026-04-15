"""project_documents.quantity_variation_submitted_at

Revision ID: 006_quantity_variation_submitted_to_qs
Revises: 005_project_document_work_order_heading
Create Date: 2026-04-11

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_quantity_variation_submitted_to_qs"
down_revision: Union[str, None] = "005_project_document_work_order_heading"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "project_documents",
        sa.Column("quantity_variation_submitted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_documents", "quantity_variation_submitted_at")
