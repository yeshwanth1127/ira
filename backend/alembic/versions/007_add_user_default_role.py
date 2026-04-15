"""add_user_default_role

Revision ID: 007
Revises: 006_quantity_variation_submitted_to_qs
Create Date: 2026-04-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision = '007'
down_revision = '006_quantity_variation_submitted_to_qs'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite doesn't support adding columns with constraints easily, so we need to use batch_alter_table
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('default_role', sa.String(50), nullable=False, server_default='contracts'))


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('default_role')
