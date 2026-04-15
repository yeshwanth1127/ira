"""boq customer approval columns

Revision ID: 003_boq_customer_approval
Revises: 002_boq_meta
Create Date: 2026-04-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_boq_customer_approval"
down_revision: Union[str, None] = "002_boq_meta"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "boq_versions",
        sa.Column(
            "customer_approval_status",
            sa.String(32),
            nullable=False,
            server_default="not_sent",
        ),
    )
    op.add_column("boq_versions", sa.Column("customer_approval_note", sa.Text(), nullable=True))
    op.add_column(
        "boq_versions",
        sa.Column("customer_submitted_for_approval_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "boq_versions",
        sa.Column("customer_approval_decided_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("boq_versions", "customer_approval_decided_at")
    op.drop_column("boq_versions", "customer_submitted_for_approval_at")
    op.drop_column("boq_versions", "customer_approval_note")
    op.drop_column("boq_versions", "customer_approval_status")
