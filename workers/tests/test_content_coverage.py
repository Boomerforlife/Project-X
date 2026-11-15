"""Content import: coverage report (offline file mode, DB mode via fake cursor, rendering) and the CLI."""

from __future__ import annotations

import json
from pathlib import Path

from pxw.cli import main
from pxw.content.coverage import coverage_from_db, coverage_from_records, render_json, render_markdown
from pxw.content.schema import RawRecord, load_records
from pxw.content.taxonomy import parse_seed_taxonomy

TAX = parse_seed_taxonomy()
EXAMPLES = Path(__file__).resolve().parents[1] / "content" / "examples"


def _row(i, chapter, subject="PHYSICS", year=None, **kw):
    d = {
        "source": "S", "licence": "Owned: t", "source_ref": "r", "exam": "jee-main", "subject": subject,
        "chapter": chapter, "type": "NUMERICAL", "stem": f"stem {i}", "answer": "1", "difficulty": "EASY", **kw,
    }
    if year:
        d["year"] = year
    return RawRecord(i, d)


def test_offline_coverage_counts_valid_rows_only():
    recs = [_row(1, "kinematics", year=2024), _row(2, "kinematics", year=2024), _row(3, "optics", year=2023),
            _row(4, "kinematics", answer="zzz"), _row(5, "kinematics", year=2024, stem="stem 1")]  # invalid; duplicate
    rep = coverage_from_records(recs, TAX)
    assert rep["source"] == "file" and rep["totals"]["DRAFT"] == 3 and rep["totals"]["PUBLISHED"] == 0
    by = {(r["year"], r["chapter"]): r["count"] for r in rep["rows"]}
    assert by == {(2024, "jee-main-physics-kinematics"): 2, (2023, "jee-main-physics-optics"): 1}
    assert rep["file_validation"]["invalid"] == 1 and rep["file_validation"]["duplicates"] == 1
    empty = {c["chapter"] for c in rep["chapters_without_published_questions"]}
    assert "jee-main-physics-kinematics" not in empty and "jee-main-chemistry-atomic-structure" in empty
    # only exams present in the file are listed
    assert all(c["exam"] == "jee-main" for c in rep["chapters_without_published_questions"])


def test_markdown_and_json_render():
    rep = coverage_from_records(load_records(EXAMPLES / "editorial-sample.jsonl"), TAX, allow_examples=True)
    md = render_markdown(rep)
    assert md.startswith("# Content coverage") and "| DRAFT | 3 |" in md and "## By chapter" in md
    assert "Chapters with no rows in this file" in md
    assert json.loads(render_json(rep))["totals"]["DRAFT"] == 3


class _Cur:
    def __init__(self, conn):
        self.conn = conn
        self.rows = []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self.rows = self.conn.empty if "not exists" in sql else self.conn.cov

    def fetchall(self):
        return self.rows


class _Conn:
    def __init__(self):
        self.cov = [
            {"exam": "jee-main", "year": 2024, "subject": "PHYSICS", "chapter": "jee-main-physics-kinematics",
             "status": "PUBLISHED", "n": 5, "with_solution": 4},
            {"exam": "jee-main", "year": 2024, "subject": "PHYSICS", "chapter": "jee-main-physics-kinematics",
             "status": "DRAFT", "n": 2, "with_solution": 0},
            {"exam": "jee-main", "year": None, "subject": "(none)", "chapter": "(none)", "status": "DRAFT", "n": 1,
             "with_solution": 0},
        ]
        self.empty = [{"exam": "jee-main", "subject": "CHEMISTRY", "chapter": "jee-main-chemistry-solutions", "name": "Solutions"}]
        self.rolled_back = False

    def cursor(self):
        return _Cur(self)

    def rollback(self):
        self.rolled_back = True


def test_db_coverage_totals_and_solution_counts():
    conn = _Conn()
    rep = coverage_from_db(conn)
    assert rep["totals"] == {"DRAFT": 3, "PUBLISHED": 5, "ARCHIVED": 0, "published_with_current_solution": 4}
    assert conn.rolled_back
    md = render_markdown(rep)
    assert "Published questions with a current solution: **4** of 5" in md
    assert "jee-main-chemistry-solutions" in md and "Chapters with no published questions (1)" in md


# --- CLI ------------------------------------------------------------------------------------------


def _events(capsys):
    return [json.loads(x) for x in capsys.readouterr().out.splitlines() if x.startswith("{")]


def test_cli_validate_examples_offline(capsys):
    path = str(EXAMPLES / "editorial-sample.csv")
    assert main(["content", "validate", path]) == 1  # [EXAMPLE] rows are refused by default
    capsys.readouterr()
    assert main(["content", "validate", path, "--allow-examples"]) == 0
    summary = _events(capsys)[-1]
    assert summary["event"] == "summary" and summary["valid"] == 3 and summary["checks"]["source_approval"].startswith("not checked")


def test_cli_coverage_file_out(tmp_path, capsys):
    out = tmp_path / "cov.json"
    code = main(["content", "coverage", "--file", str(EXAMPLES / "editorial-sample.jsonl"), "--allow-examples", "--json",
                 "--out", str(out)])
    assert code == 0 and json.loads(out.read_text(encoding="utf-8"))["totals"]["DRAFT"] == 3
    assert _events(capsys)[-1]["event"] == "done"


def test_cli_import_and_db_coverage_need_database_url(monkeypatch, capsys):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert main(["content", "import", str(EXAMPLES / "editorial-sample.csv")]) == 2
    assert main(["content", "coverage"]) == 2
    assert main(["content", "validate", str(EXAMPLES / "editorial-sample.csv"), "--db"]) == 2
    assert main(["content", "validate", str(EXAMPLES / "missing.csv")]) == 2
    capsys.readouterr()
