"""boq source file storage key

Revision ID: 009
Revises: 008
Create Date: 2026-04-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("boq_versions") as batch_op:
        batch_op.add_column(sa.Column("source_storage_key", sa.String(768), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("boq_versions") as batch_op:
        batch_op.drop_column("source_storage_key")
