"""boq form metadata columns

Revision ID: 002_boq_meta
Revises: 001_initial
Create Date: 2026-04-10

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_boq_meta"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("boq_versions", sa.Column("form_project_name", sa.String(255), nullable=True))
    op.add_column("boq_versions", sa.Column("cluster_head", sa.String(255), nullable=True))
    op.add_column("boq_versions", sa.Column("client_name", sa.String(255), nullable=True))
    op.add_column("boq_versions", sa.Column("source_filename", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("boq_versions", "source_filename")
    op.drop_column("boq_versions", "client_name")
    op.drop_column("boq_versions", "cluster_head")
    op.drop_column("boq_versions", "form_project_name")
