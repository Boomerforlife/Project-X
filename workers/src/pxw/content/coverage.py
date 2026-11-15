"""Coverage report: what the question bank contains (DB) or what an import file would add (offline)."""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from pxw.content.schema import RawRecord
from pxw.content.taxonomy import Taxonomy
from pxw.content.validate import validate_records

STATUSES = ("DRAFT", "PUBLISHED", "ARCHIVED")

COVERAGE_SQL = (
    "select e.slug as exam, q.year, coalesce(s.code, '(none)') as subject, coalesce(c.slug, '(none)') as chapter, "
    "q.publication_status::text as status, count(*)::int as n, "
    "count(*) filter (where q.current_solution_id is not null)::int as with_solution "
    "from questions q join exams e on e.id = q.exam_id "
    "left join subjects s on s.id = q.subject_id left join chapters c on c.id = q.chapter_id "
    "group by e.slug, q.year, s.code, c.slug, q.publication_status "
    "order by e.slug, q.year nulls last, s.code, c.slug, q.publication_status"
)
EMPTY_CHAPTERS_SQL = (
    "select e.slug as exam, s.code as subject, c.slug as chapter, c.name as name "
    "from chapters c join subjects s on s.id = c.subject_id join exams e on e.id = s.exam_id "
    "where e.is_active and c.is_active and not exists "
    "(select 1 from questions q where q.chapter_id = c.id and q.publication_status = 'PUBLISHED') "
    "order by e.sort_order, s.sort_order, c.sort_order"
)


def coverage_from_db(conn: Any) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute(COVERAGE_SQL)
        rows = [
            {"exam": r["exam"], "year": r["year"], "subject": r["subject"], "chapter": r["chapter"],
             "status": r["status"], "count": r["n"], "with_current_solution": r["with_solution"]}
            for r in cur.fetchall()
        ]
        cur.execute(EMPTY_CHAPTERS_SQL)
        empty = [dict(r) for r in cur.fetchall()]
    conn.rollback()  # read-only
    return _assemble("db", rows, empty)


def coverage_from_records(records: Sequence[RawRecord], taxonomy: Taxonomy, *, allow_examples: bool = False) -> dict[str, Any]:
    """Offline: what the file's valid rows would add (all as DRAFT). Invalid rows and in-file duplicates are excluded."""
    report = validate_records(records, taxonomy=taxonomy, allow_examples=allow_examples)
    counts: dict[tuple[str, Any, str, str], int] = defaultdict(int)
    with_solution: dict[tuple[str, Any, str, str], int] = defaultdict(int)
    exams: set[str] = set()
    chapters_hit: set[str] = set()
    for r in report.results:
        if r.status != "valid" or r.row is None or r.resolution is None:
            continue
        res = r.resolution
        subj = next((s.code for s in taxonomy.subjects if s.slug == res.subject_slug), res.subject_slug or "(none)")
        key = (res.exam_slug or "", r.row.year, subj, res.chapter_slug or "(none)")
        counts[key] += 1
        with_solution[key] += 1 if r.row.solution else 0
        exams.add(res.exam_slug or "")
        if res.chapter_slug:
            chapters_hit.add(res.chapter_slug)
    rows = [
        {"exam": k[0], "year": k[1], "subject": k[2], "chapter": k[3], "status": "DRAFT", "count": n,
         "with_current_solution": 0, "with_solution_text": with_solution[k]}
        for k, n in sorted(counts.items(), key=lambda kv: (kv[0][0], kv[0][1] or 0, kv[0][2], kv[0][3]))
    ]
    empty = []
    for ch in taxonomy.chapters:
        sub = next((s for s in taxonomy.subjects if s.slug == ch.subject_slug), None)
        if sub is None or sub.exam_slug not in exams or ch.slug in chapters_hit:
            continue
        empty.append({"exam": sub.exam_slug, "subject": sub.code, "chapter": ch.slug, "name": ch.name})
    out = _assemble("file", rows, empty)
    out["file_validation"] = report.summary
    return out


def _assemble(source: str, rows: list[dict[str, Any]], empty: list[dict[str, Any]]) -> dict[str, Any]:
    totals: dict[str, int] = {s: 0 for s in STATUSES}
    pub_sol = 0
    for r in rows:
        totals[r["status"]] = totals.get(r["status"], 0) + r["count"]
        if r["status"] == "PUBLISHED":
            pub_sol += r["with_current_solution"]
    return {
        "source": source,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "totals": {**totals, "published_with_current_solution": pub_sol},
        "rows": rows,
        "chapters_without_published_questions": empty,
    }


def _table(headers: list[str], body: list[list[Any]]) -> list[str]:
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    out += ["| " + " | ".join("" if c is None else str(c) for c in row) + " |" for row in body]
    return out


def render_markdown(rep: dict[str, Any]) -> str:
    is_db = rep["source"] == "db"
    t = rep["totals"]
    lines = [f"# Content coverage ({'database' if is_db else 'import file (offline, would be added as DRAFT)'})", "",
             f"Generated {rep['generated_at']}", ""]
    lines += _table(["Status", "Questions"], [[s, t.get(s, 0)] for s in STATUSES])
    if is_db:
        lines += ["", f"Published questions with a current solution: **{t['published_with_current_solution']}** of {t['PUBLISHED']}"]
    if rep.get("file_validation"):
        v = rep["file_validation"]
        lines += ["", f"File rows: {v['rows']} ({v['valid']} valid, {v['duplicates']} duplicate, {v['invalid']} invalid)"]

    def pivot(keys: tuple[str, ...], title: str) -> None:
        agg: dict[tuple[Any, ...], dict[str, int]] = defaultdict(lambda: defaultdict(int))
        sol: dict[tuple[Any, ...], int] = defaultdict(int)
        for r in rep["rows"]:
            k = tuple(r[x] if r[x] is not None else "(none)" for x in keys)
            agg[k][r["status"]] += r["count"]
            if r["status"] == "PUBLISHED":
                sol[k] += r["with_current_solution"]
        lines.extend(["", f"## {title}", ""])
        if not agg:
            lines.append("_No rows._")
            return
        head = [x.capitalize() for x in keys] + list(STATUSES) + (["Published w/ solution"] if is_db else [])
        body = []
        for k in sorted(agg, key=lambda kk: tuple(str(x) for x in kk)):
            body.append(list(k) + [agg[k].get(s, 0) for s in STATUSES] + ([sol[k]] if is_db else []))
        lines.extend(_table(head, body))

    pivot(("exam", "year"), "By exam and year")
    pivot(("exam", "subject"), "By exam and subject")
    pivot(("exam", "subject", "chapter"), "By chapter")
    pivot(("exam", "year", "subject", "chapter"), "Full breakdown: exam x year x subject x chapter")

    empty = rep["chapters_without_published_questions"]
    lines += ["", f"## Chapters with no {'published questions' if is_db else 'rows in this file'} ({len(empty)})", ""]
    if empty:
        lines += _table(["Exam", "Subject", "Chapter"], [[e["exam"], e["subject"], e["chapter"]] for e in empty])
    else:
        lines.append("_None._")
    return "\n".join(lines) + "\n"


def render_json(rep: dict[str, Any]) -> str:
    return json.dumps(rep, indent=2, ensure_ascii=False, default=str) + "\n"
