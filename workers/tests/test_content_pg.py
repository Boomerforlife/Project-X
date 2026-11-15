"""Content import against a real migrated + seeded Postgres. Skipped unless PXW_TEST_DATABASE_URL is set."""

from __future__ import annotations

import os
import uuid

import pytest

URL = os.environ.get("PXW_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not URL, reason="PXW_TEST_DATABASE_URL not set (start `npm run db:serve` and export "
                    "PXW_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres to run)"
)


def _rec(stem: str, source: str = "PROJECTX_EDITORIAL"):
    from pxw.content.schema import RawRecord

    return RawRecord(1, {
        "source": source, "licence": "Owned: pg test rows", "source_ref": "internal:pg", "exam": "jee-main",
        "subject": "PHYSICS", "chapter": "kinematics", "type": "SINGLE_MCQ", "difficulty": "EASY", "stem": stem,
        "options": ["1", "2", "3", "4"], "answer": "C", "solution": "Because.", "external_id": "pg-1",
    })


def test_import_draft_idempotent_and_dry_run():
    from pxw.common.errors import SourceNotApproved
    from pxw.content.coverage import coverage_from_db
    from pxw.content.importer import import_rows
    from pxw.db.pg import get_connection

    conn = get_connection(URL)
    stem = f"pg import test {uuid.uuid4()}"

    dry = import_rows(conn, [_rec(stem)], dry_run=True)
    assert len(dry.imported) == 1
    with conn.cursor() as cur:
        cur.execute("select count(*) as n from questions where question_text = %s", (stem,))
        assert cur.fetchone()["n"] == 0  # rolled back
    conn.rollback()

    rep = import_rows(conn, [_rec(stem)], dry_run=False)
    assert len(rep.imported) == 1 and rep.solutions_created == 1
    qid = rep.imported[0]["id"]
    with conn.cursor() as cur:
        cur.execute(
            "select publication_status::text as p, ingestion_status::text as i, origin::text as o, answer_key_source::text as a,"
            " current_solution_id, source_id, answer_key from questions where id = %s", (qid,))
        q = cur.fetchone()
        cur.execute("select review_status::text as r, provenance::text as p from solution_versions where question_id = %s", (qid,))
        sol = cur.fetchone()
        cur.execute("select count(*) as n from audit_log where entity_id = %s and action = 'content.import'", (qid,))
        audit = cur.fetchone()["n"]
    conn.rollback()
    assert (q["p"], q["i"], q["o"], q["a"]) == ("DRAFT", "IMPORTED", "EDITORIAL", "HUMAN")
    assert q["current_solution_id"] is None and q["source_id"] is not None and q["answer_key"]["type"] == "SINGLE_MCQ"
    assert (sol["r"], sol["p"]) == ("PENDING", "HUMAN_AUTHORED") and audit == 1

    again = import_rows(conn, [_rec(stem)], dry_run=False)
    assert again.imported == [] and again.duplicates[0]["duplicate_of"] == "questions"

    assert coverage_from_db(conn)["totals"]["DRAFT"] >= 1

    with pytest.raises(SourceNotApproved):
        import_rows(conn, [_rec(stem + " x", source="NTA")], dry_run=False)

    with conn.cursor() as cur:  # cleanup
        cur.execute("delete from questions where id = %s", (qid,))
    conn.commit()
