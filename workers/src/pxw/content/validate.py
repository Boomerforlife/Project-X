"""Row validation: per-row errors / warnings plus a summary. Works offline; a DB lookup adds licence + dedupe checks."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

from pxw.content.latex import check_latex, split_blocks
from pxw.content.schema import (
    OPTION_LABELS,
    ContentRow,
    Issue,
    RawRecord,
    parse_mcq_answer,
    parse_numeric_answer,
    parse_row,
    unknown_fields,
)
from pxw.content.taxonomy import Resolution, Taxonomy
from pxw.normalize.text import build_normalized_text, content_hash, normalize_text

EXAMPLE_PREFIX = "[EXAMPLE]"
_PLACEHOLDER_LICENCES = {"n/a", "na", "none", "unknown", "tbd", "todo", "?", "-", "null", "nil", "free", "public"}
OFFLINE = "not checked (offline)"


@dataclass(frozen=True)
class SourceInfo:
    id: str | None
    code: str
    kind: str
    reuse_permitted: bool
    approved: bool
    license_name: str | None = None

    @property
    def is_approved(self) -> bool:
        return self.reuse_permitted and self.approved


@dataclass(frozen=True)
class PaperInfo:
    id: str
    slug: str
    exam_slug: str
    year: int
    shift: int | None = None
    session_label: str | None = None


class DbLookup(Protocol):
    def get_sources(self, codes: Sequence[str]) -> dict[str, SourceInfo]: ...
    def existing_hashes(self, hashes: Sequence[str]) -> dict[str, str]: ...  # hash -> 'questions' | 'source_questions'
    def get_papers(self, slugs: Sequence[str]) -> dict[str, PaperInfo]: ...


class PgLookup:
    """DbLookup over a psycopg connection with dict rows (pxw.db.pg.get_connection). Read-only."""

    def __init__(self, conn: Any) -> None:
        self.conn = conn

    def get_sources(self, codes: Sequence[str], *, lock: bool = False) -> dict[str, SourceInfo]:
        if not codes:
            return {}
        sql = (
            "select id, code, kind::text as kind, reuse_permitted, approved_at, license_name "
            "from sources where code = any(%s)" + (" for share" if lock else "")
        )
        with self.conn.cursor() as cur:
            cur.execute(sql, (list(codes),))
            return {
                r["code"]: SourceInfo(str(r["id"]), r["code"], r["kind"], bool(r["reuse_permitted"]),
                                      r["approved_at"] is not None, r["license_name"])
                for r in cur.fetchall()
            }

    def existing_hashes(self, hashes: Sequence[str]) -> dict[str, str]:
        out: dict[str, str] = {}
        if not hashes:
            return out
        with self.conn.cursor() as cur:
            cur.execute("select distinct content_hash from source_questions where content_hash = any(%s)", (list(hashes),))
            for r in cur.fetchall():
                out[r["content_hash"]] = "source_questions"
            cur.execute("select distinct content_hash from questions where content_hash = any(%s)", (list(hashes),))
            for r in cur.fetchall():
                out[r["content_hash"]] = "questions"  # questions wins: it is the stronger "already imported" signal
        return out

    def get_papers(self, slugs: Sequence[str]) -> dict[str, PaperInfo]:
        if not slugs:
            return {}
        with self.conn.cursor() as cur:
            cur.execute(
                "select p.id, p.slug, e.slug as exam_slug, p.year, p.shift, p.session_label "
                "from exam_papers p join exams e on e.id = p.exam_id where p.slug = any(%s)",
                (list(slugs),),
            )
            return {
                r["slug"]: PaperInfo(str(r["id"]), r["slug"], r["exam_slug"], int(r["year"]), r["shift"], r["session_label"])
                for r in cur.fetchall()
            }


@dataclass
class RowResult:
    index: int
    row: ContentRow | None = None
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    content_hash: str | None = None
    normalized_text: str | None = None
    duplicate_of: str | None = None  # 'file row N' | 'questions' | 'source_questions'
    resolution: Resolution | None = None
    source: SourceInfo | None = None
    paper: PaperInfo | None = None
    answer_key: dict[str, Any] | None = None  # without option ids for MCQ: {"type", "labels"} ; see build.py

    @property
    def status(self) -> str:
        if self.errors:
            return "invalid"
        return "duplicate" if self.duplicate_of else "valid"

    @property
    def external_id(self) -> str | None:
        return self.row.external_id if self.row else None

    def to_dict(self) -> dict[str, Any]:
        return {
            "row": self.index,
            "status": self.status,
            "external_id": self.external_id,
            "content_hash": self.content_hash,
            "duplicate_of": self.duplicate_of,
            "errors": [i.to_dict() for i in self.errors],
            "warnings": [i.to_dict() for i in self.warnings],
        }


@dataclass
class ValidationReport:
    results: list[RowResult]
    checks: dict[str, str]

    @property
    def summary(self) -> dict[str, Any]:
        statuses = [r.status for r in self.results]
        return {
            "rows": len(self.results),
            "valid": statuses.count("valid"),
            "duplicates": statuses.count("duplicate"),
            "invalid": statuses.count("invalid"),
            "rows_with_warnings": sum(1 for r in self.results if r.warnings),
            "checks": self.checks,
        }

    @property
    def ok(self) -> bool:
        return not any(r.errors for r in self.results)


def _latex_issues(text: str, field_name: str) -> list[Issue]:
    return [Issue(f"LATEX_{i.code}", i.message, field_name) for i in check_latex(text)]


def _check_row(row: ContentRow, taxonomy: Taxonomy, allow_examples: bool) -> RowResult:
    res = RowResult(index=0, row=row)
    err, warn = res.errors, res.warnings

    if row.stem.startswith(EXAMPLE_PREFIX) and not allow_examples:
        err.append(Issue("EXAMPLE_ROW", "stem starts with [EXAMPLE]: sample rows are never imported", "stem"))
    if len(row.stem) > 20000:
        err.append(Issue("STEM_TOO_LONG", "stem exceeds 20000 characters", "stem"))
    if row.licence.strip().lower() in _PLACEHOLDER_LICENCES:
        err.append(Issue("LICENCE_PLACEHOLDER", f"licence '{row.licence}' is not a licence or permission reference", "licence"))

    # options
    opts = row.options
    if row.qtype == "NUMERICAL":
        if opts and any(o for o in opts):
            err.append(Issue("OPTIONS_NOT_ALLOWED", "NUMERICAL questions must not have options", "options"))
        opts = None
    else:
        if opts is None or len(opts) != 4:
            err.append(Issue("OPTIONS_COUNT", f"MCQ needs exactly 4 options (got {0 if opts is None else len(opts)})", "options"))
        else:
            for label, o in zip(OPTION_LABELS, opts, strict=True):
                if not isinstance(o, str) or not o.strip():
                    err.append(Issue("OPTION_EMPTY", f"option {label} is empty", f"option_{label.lower()}"))
            texts = [normalize_text(o) for o in opts if isinstance(o, str) and o.strip()]
            if len(set(texts)) != len(texts):
                err.append(Issue("OPTIONS_NOT_DISTINCT", "options must be distinct", "options"))
            for label, o in zip(OPTION_LABELS, opts, strict=True):
                if isinstance(o, str) and len(o) > 5000:
                    err.append(Issue("OPTION_TOO_LONG", f"option {label} exceeds 5000 characters", f"option_{label.lower()}"))

    # answer
    if row.qtype == "NUMERICAL":
        key, issues = parse_numeric_answer(row.answer)
        err += issues
        res.answer_key = key
    else:
        n = len(opts) if opts else 4
        labels, issues = parse_mcq_answer(row.answer, min(n, 4), row.qtype == "MULTI_MCQ")
        err += issues
        if not issues:
            res.answer_key = {"type": row.qtype, "labels": labels}
            if row.qtype == "MULTI_MCQ" and len(labels) == 1:
                warn.append(Issue("MULTI_SINGLE_ANSWER", "MULTI_MCQ with a single correct label: check the type", "answer"))

    # LaTeX + block limits
    err += _latex_issues(row.stem, "stem")
    if opts:
        for label, o in zip(OPTION_LABELS, opts, strict=False):
            if isinstance(o, str):
                err += _latex_issues(o, f"option_{label.lower()}")
    if row.solution:
        err += _latex_issues(row.solution, "solution")
    for fname, text in [("stem", row.stem), ("solution", row.solution)]:
        if text:
            blocks = split_blocks(text)
            if len(blocks) > 100:
                err.append(Issue("TOO_MANY_BLOCKS", f"{fname} produces more than 100 content blocks", fname))
            for b in blocks:
                if (b["type"] == "math" and len(b["latex"]) > 5000) or (b["type"] == "paragraph" and len(b["text"]) > 20000):
                    err.append(Issue("BLOCK_TOO_LONG", f"{fname} has an over-long block", fname))
                    break

    # taxonomy
    res.resolution = taxonomy.resolve(row.exam, row.subject, row.chapter, row.topic)
    err += res.resolution.errors
    warn += res.resolution.warnings

    # hash (needs a stem; options only for MCQ)
    option_pairs = (
        [(lb, o) for lb, o in zip(OPTION_LABELS, opts, strict=False) if isinstance(o, str)] if opts else []
    )
    res.normalized_text = build_normalized_text(row.stem, option_pairs)
    res.content_hash = content_hash(res.normalized_text)

    # warnings that help reviewers
    if row.difficulty is None:
        warn.append(Issue("NO_DIFFICULTY", "difficulty missing: it is required before a question can be published", "difficulty"))
    if not row.topic:
        warn.append(Issue("NO_TOPIC", "topic missing", "topic"))
    if not row.solution:
        warn.append(Issue("NO_SOLUTION", "no solution text: a reviewer must author one before publishing", "solution"))
    if row.paper and row.year is None:
        warn.append(Issue("PAPER_WITHOUT_YEAR", "paper given without year (year will come from the paper)", "year"))
    return res


def validate_records(
    records: Iterable[RawRecord],
    *,
    taxonomy: Taxonomy,
    db: DbLookup | None = None,
    allow_examples: bool = False,
) -> ValidationReport:
    results: list[RowResult] = []
    seen: dict[str, int] = {}
    for rec in records:
        if rec.data is None:
            r = RowResult(index=rec.index)
            r.errors.append(Issue("UNPARSEABLE_ROW", rec.error or "row could not be read"))
            results.append(r)
            continue
        row, issues = parse_row(rec.data)
        if row is None:
            r = RowResult(index=rec.index, errors=list(issues))
        else:
            r = _check_row(row, taxonomy, allow_examples)
            r.errors = issues + r.errors
        r.index = rec.index
        extra = unknown_fields(rec.data)
        if extra:
            r.warnings.append(Issue("UNKNOWN_FIELDS", f"ignored unknown fields: {', '.join(extra)}"))
        if r.content_hash and not r.errors:
            first = seen.get(r.content_hash)
            if first is not None:
                r.duplicate_of = f"file row {first}"
            else:
                seen[r.content_hash] = r.index
        results.append(r)

    checks: dict[str, str] = {
        "taxonomy": f"{taxonomy.origin}",
        "source_approval": OFFLINE,
        "paper": OFFLINE,
        "dedupe_against_db": OFFLINE,
    }
    if db is not None:
        checks["source_approval"] = "checked"
        checks["paper"] = "checked"
        checks["dedupe_against_db"] = "checked"
        _db_checks(results, db)
    return ValidationReport(results, checks)


def _db_checks(results: list[RowResult], db: DbLookup) -> None:
    rows = [r for r in results if r.row is not None]
    codes = sorted({r.row.source for r in rows if r.row})
    sources = db.get_sources(codes)
    papers = db.get_papers(sorted({r.row.paper for r in rows if r.row and r.row.paper}))
    for r in rows:
        assert r.row is not None
        src = sources.get(r.row.source)
        if src is None:
            r.errors.append(Issue("SOURCE_UNKNOWN", f"source '{r.row.source}' does not exist in sources", "source"))
        elif not src.is_approved:
            r.errors.append(
                Issue("SOURCE_NOT_APPROVED", f"source '{src.code}' is not licence-approved (reuse_permitted + approved_at)", "source")
            )
        else:
            r.source = src
            if src.kind == "AI_GENERATION":
                r.warnings.append(Issue("AI_GENERATED", "source kind is AI_GENERATION: content is labelled AI_GENERATED and its answer is not stored as a key", "source"))
        if r.row.paper:
            p = papers.get(r.row.paper)
            if p is None:
                r.errors.append(Issue("PAPER_UNKNOWN", f"paper '{r.row.paper}' does not exist in exam_papers", "paper"))
            else:
                r.paper = p
                if r.resolution and r.resolution.exam_slug and p.exam_slug != r.resolution.exam_slug:
                    r.errors.append(Issue("PAPER_EXAM_MISMATCH", f"paper '{p.slug}' belongs to exam '{p.exam_slug}'", "paper"))
                if r.row.year is not None and r.row.year != p.year:
                    r.errors.append(Issue("PAPER_YEAR_MISMATCH", f"year {r.row.year} differs from paper year {p.year}", "year"))
    hashes = sorted({r.content_hash for r in rows if r.content_hash and not r.errors and not r.duplicate_of})
    existing = db.existing_hashes(hashes)
    for r in rows:
        if r.content_hash in existing and not r.errors and not r.duplicate_of:
            r.duplicate_of = existing[r.content_hash]
    # an errored row that is the "first" of an in-file duplicate group keeps later rows flagged; nothing else to do



def format_text_report(report: ValidationReport, *, only_problems: bool = True) -> str:
    lines: list[str] = []
    for r in report.results:
        if only_problems and not (r.errors or r.warnings or r.duplicate_of):
            continue
        lines.append(f"row {r.index}: {r.status}" + (f" (duplicate of {r.duplicate_of})" if r.duplicate_of else ""))
        lines += [f"  ERROR   {i.code}: {i.message}" for i in r.errors]
        lines += [f"  warning {i.code}: {i.message}" for i in r.warnings]
    s = report.summary
    lines.append(
        f"{s['rows']} rows: {s['valid']} valid, {s['duplicates']} duplicate, {s['invalid']} invalid; checks: {s['checks']}"
    )
    return "\n".join(lines)
