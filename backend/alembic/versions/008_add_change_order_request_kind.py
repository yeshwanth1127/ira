"""add_change_order_request_kind

Revision ID: 008
Revises: 007
Create Date: 2026-04-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('change_orders') as batch_op:
        batch_op.add_column(sa.Column('request_kind', sa.String(64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('change_orders') as batch_op:
        batch_op.drop_column('request_kind')