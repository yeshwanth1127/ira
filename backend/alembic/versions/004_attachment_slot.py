"""attachment slot for calculation vs shop drawing

Revision ID: 004_attachment_slot
Revises: 003_boq_customer_approval
Create Date: 2026-04-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004_attachment_slot"
down_revision: Union[str, None] = "003_boq_customer_approval"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("attachments", sa.Column("attachment_slot", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column("attachments", "attachment_slot")
