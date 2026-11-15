"""Content import: row -> insert plan, and the importer's transaction/licence behaviour (fake cursor, no DB needed)."""

from __future__ import annotations

import copy
import uuid
from dataclasses import replace

import pytest

from pxw.common.errors import SourceNotApproved
from pxw.content.build import build_question, origin_for_kind
from pxw.content.importer import import_rows, question_insert_sql
from pxw.content.schema import RawRecord
from pxw.content.taxonomy import Taxonomy, parse_seed_taxonomy
from pxw.content.validate import SourceInfo, validate_records

SEED = parse_seed_taxonomy()
DB_TAX = Taxonomy(
    exams=[replace(e, id=f"exam-{e.slug}") for e in SEED.exams],
    subjects=[replace(s, id=f"sub-{s.slug}") for s in SEED.subjects],
    chapters=[replace(c, id=f"chap-{c.slug}") for c in SEED.chapters],
    topics=[replace(t, id=f"top-{t.slug}") for t in SEED.topics],
    origin="db",
)

GOOD = {
    "source": "PROJECTX_EDITORIAL", "licence": "Owned: test rows", "source_ref": "internal:1", "exam": "jee-main",
    "subject": "PHYSICS", "chapter": "kinematics", "topic": "projectile-motion", "type": "SINGLE_MCQ",
    "difficulty": "EASY", "stem": "A ball $$x = \\frac{1}{2} g t^2$$ is dropped. Acceleration?", "answer": "B",
    "options": ["$g$", "$2g$", "$g/2$", "0"], "solution": "It is $g$.", "external_id": "t-1", "notes": "n",
}


def rec(i=1, **over):
    d = copy.deepcopy(GOOD)
    d.update(over)
    return RawRecord(i, {k: v for k, v in d.items() if v is not None})


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn
        self.rows: list[dict] = []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self.conn.executed.append((sql, params))
        s = " ".join(sql.split())
        c = self.conn
        if "from sources where code" in s:
            self.rows = [
                {"id": x.id, "code": x.code, "kind": x.kind, "reuse_permitted": x.reuse_permitted,
                 "approved_at": "2026-01-01" if x.approved else None, "license_name": x.license_name}
                for x in c.sources.values()
            ]
        elif "from source_questions" in s:
            self.rows = [{"content_hash": h} for h in c.sq_hashes]
        elif "from questions where content_hash" in s:
            self.rows = [{"content_hash": h} for h in c.q_hashes]
        elif "from exam_papers" in s:
            self.rows = []
        elif s.startswith("insert into questions"):
            c.n += 1
            self.rows = [{"id": uuid.uuid4(), "slug": f"slug-{c.n}"}]
        elif s.startswith("insert into solution_versions"):
            self.rows = [{"id": uuid.uuid4()}]
        else:
            self.rows = []

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeConn:
    def __init__(self, sources=None, q_hashes=(), sq_hashes=()):
        self.sources = sources if sources is not None else {
            "PROJECTX_EDITORIAL": SourceInfo("src-1", "PROJECTX_EDITORIAL", "EDITORIAL_TEAM", True, True),
            "PROJECTX_AI": SourceInfo("src-2", "PROJECTX_AI", "AI_GENERATION", True, True),
        }
        self.q_hashes, self.sq_hashes = list(q_hashes), list(sq_hashes)
        self.executed: list[tuple[str, object]] = []
        self.commits = self.rollbacks = 0
        self.n = 0

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def inserts(self, table):
        return [(s, p) for s, p in self.executed if " ".join(s.split()).startswith(f"insert into {table}")]


def built(**over):
    rep = validate_records([rec(**over)], taxonomy=DB_TAX)
    r = rep.results[0]
    r.source = SourceInfo("src-1", "PROJECTX_EDITORIAL", "EDITORIAL_TEAM", True, True)
    assert not r.errors, r.errors
    return build_question(r, batch_id="b1", file_name="f.csv")


# --- pure builder ---------------------------------------------------------------------------------


def test_origin_mirrors_promote_source_question():
    assert origin_for_kind("OFFICIAL_EXAM_BODY") == "PYQ"
    assert origin_for_kind("LICENSED_PUBLISHER") == "PYQ"
    assert origin_for_kind("EDITORIAL_TEAM") == "EDITORIAL"
    assert origin_for_kind("AI_GENERATION") == "AI_GENERATED"


def test_builds_draft_question_with_contract_shapes():
    b = built()
    q = b.question
    assert q["publication_status"] == "DRAFT" and q["ingestion_status"] == "IMPORTED"
    assert q["verification_status"] == "HUMAN_REVIEW_REQUIRED"
    assert q["origin"] == "EDITORIAL" and q["source_id"] == "src-1" and q["question_type"] == "SINGLE_MCQ"
    assert q["exam_id"] == "exam-jee-main" and q["subject_id"] == "sub-jee-main-physics"
    assert q["chapter_id"] == "chap-jee-main-physics-kinematics"
    assert q["topic_id"] == "top-jee-main-physics-kinematics-projectile-motion"
    assert q["content_hash"] and q["dedupe_text"] and "||" in q["dedupe_text"]
    # ContentBlocks: paragraph / math / paragraph
    assert [x["type"] for x in q["structured_content"]] == ["paragraph", "math", "paragraph"]
    assert q["structured_content"][1] == {"type": "math", "latex": "x = \\frac{1}{2} g t^2"}
    # options + AnswerKey with the generated option UUIDs
    assert [o["label"] for o in b.options] == ["A", "B", "C", "D"] and [o["sort_order"] for o in b.options] == [0, 1, 2, 3]
    assert q["answer_key"] == {"type": "SINGLE_MCQ", "correct_option_ids": [b.options[1]["id"]]}
    assert q["answer_key_source"] == "HUMAN"
    assert b.options[0]["content"] == [{"type": "paragraph", "text": "$g$"}] and b.options[0]["content_text"] == "$g$"
    # solution is a PENDING-review human-authored version; never current
    assert b.solution["provenance"] == "HUMAN_AUTHORED" and b.solution["final_answer"] == q["answer_key"]
    assert b.solution["steps"][0]["index"] == 1 and "current_solution_id" not in q
    # provenance sidecar
    assert b.audit["source_ref"] == "internal:1" and b.audit["licence"] == "Owned: test rows"
    assert b.audit["external_id"] == "t-1" and b.audit["notes"] == "n" and b.audit["row"] == 1


def test_numerical_key_and_no_options():
    b = built(type="NUMERICAL", options=None, answer="3.9..4.1", solution=None)
    assert b.options == [] and b.solution is None
    assert b.question["answer_key"] == {
        "type": "NUMERICAL", "accepted_ranges": [{"min": "3.9", "max": "4.1"}], "display_value": "4"}


def test_multi_key_has_all_option_ids():
    b = built(type="MULTI_MCQ", answer="A,C")
    ids = [o["id"] for o in b.options]
    assert b.question["answer_key"] == {"type": "MULTI_MCQ", "correct_option_ids": [ids[0], ids[2]]}


def test_ai_generated_answer_is_not_stored_as_a_key():
    r = validate_records([rec()], taxonomy=DB_TAX).results[0]
    r.source = SourceInfo("src-2", "PROJECTX_AI", "AI_GENERATION", True, True)
    b = build_question(r, batch_id="b")
    assert b.question["origin"] == "AI_GENERATED"
    assert b.question["answer_key"] is None and b.question["answer_key_source"] is None  # pair constraint holds
    assert b.solution["provenance"] == "AI_GENERATED" and b.audit["unstored_answer"] == "B"


def test_insert_sql_has_draft_enum_casts_and_no_slug():
    sql = question_insert_sql()
    assert "slug" not in sql.split("values")[0] and "returning id, slug" in sql
    assert "%s::question_origin" in sql and "%s::publication_status" in sql


# --- importer -------------------------------------------------------------------------------------


def test_import_inserts_draft_and_commits():
    conn = FakeConn()
    rep = import_rows(conn, [rec(1), rec(2, stem="second stem")], dry_run=False, taxonomy=DB_TAX, file_name="f.csv")
    assert rep.refused is None and len(rep.imported) == 2 and rep.solutions_created == 2
    assert conn.commits == 1
    assert len(conn.inserts("questions")) == 2 and len(conn.inserts("question_options")) == 8
    assert len(conn.inserts("solution_versions")) == 2 and len(conn.inserts("audit_log")) == 2
    for sql, params in conn.inserts("questions"):
        assert "PUBLISHED" not in params  # never publishes
        assert "DRAFT" in params and "IMPORTED" in params
    assert all(i["status"] == "DRAFT" for i in rep.imported)


def test_dry_run_rolls_back_but_still_executes_inserts():
    conn = FakeConn()
    rep = import_rows(conn, [rec()], dry_run=True, taxonomy=DB_TAX)
    assert len(rep.imported) == 1 and conn.commits == 0 and conn.rollbacks >= 1
    assert conn.inserts("questions")
    assert rep.to_dict()["committed"] is False


def test_idempotent_existing_hash_is_skipped_as_duplicate():
    first = validate_records([rec()], taxonomy=DB_TAX).results[0]
    conn = FakeConn(q_hashes=[first.content_hash])
    rep = import_rows(conn, [rec()], dry_run=False, taxonomy=DB_TAX)
    assert rep.imported == [] and len(rep.duplicates) == 1 and rep.duplicates[0]["duplicate_of"] == "questions"
    assert not conn.inserts("questions") and conn.commits == 0


def test_duplicate_in_file_inserted_once():
    conn = FakeConn()
    rep = import_rows(conn, [rec(1), rec(2)], dry_run=False, taxonomy=DB_TAX)
    assert len(rep.imported) == 1 and len(rep.duplicates) == 1


@pytest.mark.parametrize(
    "src",
    [
        {"PROJECTX_EDITORIAL": SourceInfo("s", "PROJECTX_EDITORIAL", "EDITORIAL_TEAM", False, False)},
        {"PROJECTX_EDITORIAL": SourceInfo("s", "PROJECTX_EDITORIAL", "EDITORIAL_TEAM", True, False)},
        {},
    ],
)
def test_unapproved_or_unknown_source_refuses_whole_batch(src):
    conn = FakeConn(sources=src)
    with pytest.raises(SourceNotApproved, match="SOURCE_NOT_APPROVED"):
        import_rows(conn, [rec()], dry_run=False, taxonomy=DB_TAX)
    assert not conn.inserts("questions") and conn.commits == 0 and conn.rollbacks >= 1


def test_one_unapproved_source_blocks_valid_rows_of_approved_source():
    conn = FakeConn()
    with pytest.raises(SourceNotApproved):
        import_rows(conn, [rec(1), rec(2, source="NTA", stem="other")], dry_run=False, taxonomy=DB_TAX)
    assert not conn.inserts("questions")


def test_invalid_rows_refuse_batch_unless_skip_invalid():
    conn = FakeConn()
    rows = [rec(1), rec(2, answer="Z", stem="bad answer")]
    rep = import_rows(conn, rows, dry_run=False, taxonomy=DB_TAX)
    assert rep.refused and rep.imported == [] and len(rep.invalid) == 1
    assert not conn.inserts("questions") and conn.commits == 0
    conn2 = FakeConn()
    rep2 = import_rows(conn2, rows, dry_run=False, skip_invalid=True, taxonomy=DB_TAX)
    assert rep2.refused is None and len(rep2.imported) == 1 and conn2.commits == 1


def test_example_rows_are_refused_by_default():
    conn = FakeConn()
    rep = import_rows(conn, [rec(stem="[EXAMPLE] demo")], dry_run=False, taxonomy=DB_TAX)
    assert rep.refused and not conn.inserts("questions")


def test_db_error_rolls_back_and_raises():
    class Boom(FakeConn):
        def cursor(self):
            cur = super().cursor()
            orig = cur.execute

            def execute(sql, params=None):
                if " ".join(sql.split()).startswith("insert into question_options"):
                    raise RuntimeError("db down")
                orig(sql, params)

            cur.execute = execute
            return cur

    conn = Boom()
    with pytest.raises(RuntimeError):
        import_rows(conn, [rec()], dry_run=False, taxonomy=DB_TAX)
    assert conn.commits == 0 and conn.rollbacks >= 1
