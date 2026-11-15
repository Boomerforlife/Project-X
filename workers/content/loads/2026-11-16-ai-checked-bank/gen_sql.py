"""Generate SQL that loads the independently-checked, AI-generated JEE practice questions (one file per 50 items).

Each question: origin AI_GENERATED (source PROJECTX_AI), answer key AI_CONSENSUS (template-computed answer agreed with an
independent blind solve), verification AUTOMATED_CHECKS_PASSED, NOINDEX + no sitemap (practice-only), approved AI solution,
then PUBLISHED through the normal publication guard (migration 0020). One audit_log row per question records the check.
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

from pxw.content.latex import blocks_to_text, split_blocks
from pxw.normalize.text import build_normalized_text, content_hash

ROOT = Path(sys.argv[1])
rows = [json.loads(line) for line in (ROOT / "bank-jee.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
agree = set(json.loads((ROOT / "check" / "agree.json").read_text(encoding="utf-8")))
TYPE = {"single_correct": "SINGLE_MCQ", "multiple_correct": "MULTI_MCQ", "numerical": "NUMERICAL"}


def lit(v: object) -> str:
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def jlit(v: object) -> str:
    return lit(json.dumps(v, ensure_ascii=False)) + "::jsonb"


def dec(x: float) -> str:
    s = f"{x:.6f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def build(r: dict) -> str | None:
    qtype = TYPE[r["type"]]
    ans = r["answer"]
    qid = str(uuid.uuid4())
    opts = []
    label_to_id: dict[str, str] = {}
    if qtype != "NUMERICAL":
        for i, o in enumerate(r["options"]):
            oid = str(uuid.uuid4())
            label_to_id[o["id"]] = oid
            blocks = split_blocks(o["body"])
            opts.append((oid, o["id"], i, blocks, blocks_to_text(blocks)))
    if qtype == "SINGLE_MCQ":
        key = {"type": qtype, "correct_option_ids": [label_to_id[ans["optionId"]]]}
    elif qtype == "MULTI_MCQ":
        key = {"type": qtype, "correct_option_ids": [label_to_id[x] for x in ans["optionIds"]]}
    else:
        v = float(ans["value"])
        tol = float(ans.get("tolerance") or 0)
        if tol == 0 and not v.is_integer():
            tol = 0.01  # non-integer answers: accept the 2-decimal rounding students are asked for
        key = {"type": "NUMERICAL", "accepted_ranges": [{"min": dec(v - tol), "max": dec(v + tol)}], "display_value": dec(v)}
    stem_blocks = split_blocks(r["stem"])
    norm = build_normalized_text(r["stem"], [(o[1], o[4]) for o in opts])
    steps = [
        {"index": i + 1, "title": (s.get("title") or None), "blocks": split_blocks(s.get("body") or "")}
        for i, s in enumerate(r.get("steps") or [])
    ]
    if not steps:
        return None
    diff = (r.get("difficulty") or "medium").upper()
    ch = lit(r["chapter_api"])
    out = [
        f"-- {r['id']}",
        "insert into public.questions (id, exam_id, subject_id, chapter_id, origin, question_type, difficulty, question_text,"
        " structured_content, answer_key, answer_key_source, source_id, content_hash, dedupe_text, ingestion_status,"
        " verification_status, publication_status, indexability, sitemap_include) select "
        f"{lit(qid)}, (select id from public.exams where slug = 'jee-main'), c.subject_id, c.id, 'AI_GENERATED', {lit(qtype)},"
        f" {lit(diff)}, {lit(r['stem'])}, {jlit(stem_blocks)}, {jlit(key)}, 'AI_CONSENSUS',"
        " (select id from public.sources where code = 'PROJECTX_AI'),"
        f" {lit(content_hash(norm))}, {lit(norm)}, 'CHECKED', 'AUTOMATED_CHECKS_PASSED', 'DRAFT', 'NOINDEX', false"
        f" from public.chapters c where c.slug = {ch}"
        f" and not exists (select 1 from public.questions x where x.content_hash = {lit(content_hash(norm))});",
    ]
    for oid, label, i, blocks, text in opts:
        out.append(
            "insert into public.question_options (id, question_id, label, sort_order, content, content_text) "
            f"select {lit(oid)}, {lit(qid)}, {lit(label)}, {i}, {jlit(blocks)}, {lit(text)} "
            f"where exists (select 1 from public.questions where id = {lit(qid)});"
        )
    out.append(
        "with s as (insert into public.solution_versions (question_id, final_answer, steps, provenance, review_status, reviewed_at, edit_note) "
        f"select {lit(qid)}, {jlit(key)}, {jlit(steps)}, 'AI_GENERATED', 'APPROVED', now(), "
        "'Template-computed answer; agreed with an independent blind solve (automated check, not human-reviewed)' "
        f"where exists (select 1 from public.questions where id = {lit(qid)}) returning id) "
        "update public.questions q set current_solution_id = s.id, publication_status = 'PUBLISHED' from s "
        f"where q.id = {lit(qid)};"
    )
    out.append(
        "insert into public.audit_log (actor_type, action, entity_type, entity_id, details) "
        f"select 'WORKER', 'content.import', 'question', {lit(qid)}, "
        + jlit(
            {
                "batch": "editorial-bank-2026-11-16",
                "bank_id": r["id"],
                "source": "PROJECTX_AI",
                "licence": "Owned: generated for this project",
                "check": "answer computed by template code; independent blind solve agreed",
                "verification": "AUTOMATED_CHECKS_PASSED (not human-reviewed)",
            }
        )
        + f" where exists (select 1 from public.questions where id = {lit(qid)});"
    )
    return "\n".join(out)


chosen = [r for r in rows if r["id"] in agree]
items = [s for s in (build(r) for r in chosen) if s]
out_dir = ROOT / "sql"
out_dir.mkdir(exist_ok=True)
for f in out_dir.glob("*.sql"):
    f.unlink()
for n, i in enumerate(range(0, len(items), 50), 1):
    (out_dir / f"load-{n:02d}.sql").write_text("begin;\n" + "\n".join(items[i : i + 50]) + "\ncommit;\n", encoding="utf-8")
print(f"{len(items)} questions in {len(list(out_dir.glob('*.sql')))} files (skipped {len(chosen) - len(items)} without steps)")
