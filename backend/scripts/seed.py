"""Load demo data: run from backend/ with: python -m scripts.seed"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.entities import (
    DepartmentRole,
    ErpConnectorConfig,
    Organization,
    Project,
    ProjectMembership,
    User,
)


def seed() -> None:
    db: Session = SessionLocal()
    try:
        org = db.query(Organization).first()
        if not org:
            org = Organization(name="Default Org")
            db.add(org)
            db.flush()

        for key, label in [("ERP1", "ERP Elan (mock)"), ("ERP2", "ERP Forum North (mock)")]:
            if not db.query(ErpConnectorConfig).filter(ErpConnectorConfig.connector_key == key).first():
                db.add(
                    ErpConnectorConfig(
                        connector_key=key,
                        label=label,
                        base_url="http://localhost:0/mock",
                        is_mock=True,
                    )
                )

        def ensure_user(email: str, name: str, pwd: str, superuser: bool = False) -> User:
            u = db.query(User).filter(User.email == email).first()
            if u:
                return u
            u = User(
                email=email,
                full_name=name,
                hashed_password=hash_password(pwd),
                is_superuser=superuser,
            )
            db.add(u)
            db.flush()
            return u

        admin = ensure_user("admin@alufit.local", "Admin User", "admin123", superuser=True)
        contracts = ensure_user("contracts@alufit.local", "Contracts", "demo123")
        design = ensure_user("design@alufit.local", "Design", "demo123")
        qs = ensure_user("qs@alufit.local", "QS", "demo123")

        if not db.query(Project).filter(Project.code == "FORUM-NORTH").first():
            p = Project(
                organization_id=org.id,
                name="Forum North",
                code="FORUM-NORTH",
                erp_connector_key="ERP2",
            )
            db.add(p)
            db.flush()
            for u, role in [
                (contracts, DepartmentRole.contracts),
                (design, DepartmentRole.design),
                (qs, DepartmentRole.qs),
            ]:
                db.add(ProjectMembership(user_id=u.id, project_id=p.id, role=role))

        if not db.query(Project).filter(Project.code == "ELAN").first():
            p2 = Project(
                organization_id=org.id,
                name="Elan",
                code="ELAN",
                erp_connector_key="ERP1",
            )
            db.add(p2)
            db.flush()
            for u, role in [
                (contracts, DepartmentRole.contracts),
                (design, DepartmentRole.design),
                (qs, DepartmentRole.qs),
            ]:
                db.add(ProjectMembership(user_id=u.id, project_id=p2.id, role=role))

        db.commit()
        print("Seed complete. Users: admin@alufit.local / admin123, *@alufit.local / demo123")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
