import uuid
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.entities import BoqLineItem, BoqVersion, QsComparisonRun, QsLineVariance, QsRunStatus


def run_qs_comparison(db: Session, qs_run: QsComparisonRun) -> QsComparisonRun:
    baseline = db.get(BoqVersion, qs_run.baseline_boq_version_id)
    target = db.get(BoqVersion, qs_run.target_boq_version_id)
    if not baseline or not target:
        raise ValueError("BOQ versions not found")
    if baseline.project_id != qs_run.project_id or target.project_id != qs_run.project_id:
        raise ValueError("BOQ versions must belong to project")

    db.query(QsLineVariance).filter(QsLineVariance.qs_run_id == qs_run.id).delete()
    base_lines = db.query(BoqLineItem).filter(BoqLineItem.boq_version_id == baseline.id).all()
    tgt_lines = db.query(BoqLineItem).filter(BoqLineItem.boq_version_id == target.id).all()
    by_line: dict[str, list[BoqLineItem]] = defaultdict(list)
    for li in base_lines:
        by_line[li.line_no].append(li)
    tgt_by_line: dict[str, list[BoqLineItem]] = defaultdict(list)
    for li in tgt_lines:
        tgt_by_line[li.line_no].append(li)

    all_keys = set(by_line.keys()) | set(tgt_by_line.keys())
    for line_no in sorted(all_keys):
        b = by_line[line_no][0] if by_line[line_no] else None
        t = tgt_by_line[line_no][0] if tgt_by_line[line_no] else None
        iq, ir, ia = (0.0, 0.0, 0.0)
        cq, cr, ca = (0.0, 0.0, 0.0)
        desc = ""
        if b:
            iq, ir = b.quantity, b.rate
            ia = b.amount
            desc = b.description
        if t:
            cq, cr = t.quantity, t.rate
            ca = t.amount
            desc = t.description or desc
        if not desc:
            desc = line_no
        init_amt = iq * ir if b else 0.0
        cur_amt = cq * cr if t else 0.0
        if b:
            init_amt = b.amount
        if t:
            cur_amt = t.amount
        var_amt = cur_amt - init_amt
        v = QsLineVariance(
            qs_run_id=qs_run.id,
            line_no=line_no,
            description=desc,
            initial_qty=iq,
            current_qty=cq,
            initial_rate=ir,
            current_rate=cr,
            variation_amount=var_amt,
        )
        db.add(v)

    qs_run.status = QsRunStatus.compared
    db.flush()
    db.refresh(qs_run)
    return qs_run
