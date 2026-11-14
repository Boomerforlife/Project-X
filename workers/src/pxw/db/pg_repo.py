"""PgIngestionRepo: psycopg 3, DATABASE_URL, one transaction per call. Uses DATABASE_SCHEMA 0004/0005/0007."""

from __future__ import annotations

from typing import Any

from psycopg.types.json import Jsonb

from pxw.common.errors import SourceNotApproved
from pxw.common.models import (
    AssetIn,
    OfficialKeyIn,
    PaperIn,
    Source,
    SourceDocumentIn,
    SourceDocumentRec,
    SourceQuestionIn,
    SourceQuestionRec,
)
from pxw.db.pg import run


class PgIngestionRepo:
    def __init__(self, database_url: str) -> None:
        self.url = database_url

    def get_source(self, code: str) -> Source:
        def fn(cur: Any) -> Source:
            cur.execute(
                "select id, code, name, kind::text as kind, reuse_permitted, approved_at from sources where code = %s",
                (code,),
            )
            row = cur.fetchone()
            if row is None:
                raise SourceNotApproved(f"unknown source {code!r}")
            if not (row["reuse_permitted"] and row["approved_at"]):
                raise SourceNotApproved(f"source {code!r} is not approved for reuse")
            return Source(**{**row, "id": str(row["id"])})

        return run(self.url, fn)

    def resolve_exam_id(self, exam_slug: str) -> str:
        def fn(cur: Any) -> str:
            cur.execute("select id from exams where slug = %s or code = %s", (exam_slug, exam_slug))
            row = cur.fetchone()
            if row is None:
                raise KeyError(f"exam {exam_slug!r} not found")
            return str(row["id"])

        return run(self.url, fn)

    def upsert_paper(self, paper: PaperIn) -> str:
        def fn(cur: Any) -> str:
            cur.execute("select id from exams where slug = %s", (paper.exam_slug,))
            ex = cur.fetchone()
            if ex is None:
                raise KeyError(f"exam {paper.exam_slug!r} not found")
            cur.execute(
                "insert into exam_papers (exam_id, slug, title, year, session_label, exam_date, shift, paper_code, language) "
                "values (%s, %s, %s, %s, %s, %s::date, %s, %s, %s) "
                "on conflict (slug) do update set title = excluded.title, session_label = excluded.session_label, "
                "exam_date = excluded.exam_date, shift = excluded.shift, paper_code = excluded.paper_code "
                "returning id",
                (
                    ex["id"],
                    paper.slug,
                    paper.title,
                    paper.year,
                    paper.session_label,
                    paper.exam_date,
                    paper.shift,
                    paper.paper_code,
                    paper.language,
                ),
            )
            return str(cur.fetchone()["id"])

        return run(self.url, fn)

    def register_document(self, doc: SourceDocumentIn) -> tuple[str, bool]:
        def fn(cur: Any) -> tuple[str, bool]:
            cur.execute("select id, paper_id from source_documents where sha256 = %s", (doc.sha256,))
            row = cur.fetchone()
            if row is not None:
                if doc.paper_id and row["paper_id"] is None:
                    cur.execute("update source_documents set paper_id = %s::uuid where id = %s", (doc.paper_id, row["id"]))
                return str(row["id"]), False
            cur.execute("select id from sources where code = %s", (doc.source_code,))
            src = cur.fetchone()
            if src is None:
                raise SourceNotApproved(f"unknown source {doc.source_code!r}")
            cur.execute(
                "insert into source_documents (source_id, paper_id, kind, bucket, r2_key, original_filename, mime_type, "
                "bytes, sha256, page_count) values (%s, %s::uuid, %s::source_document_kind, 'SOURCE_DOCS', %s, %s, %s, %s, %s, %s) "
                "returning id",
                (
                    src["id"],
                    doc.paper_id,
                    doc.kind,
                    doc.r2_key,
                    doc.original_filename,
                    doc.mime_type,
                    doc.bytes,
                    doc.sha256,
                    doc.page_count,
                ),
            )
            return str(cur.fetchone()["id"]), True

        return run(self.url, fn)

    def get_document(self, document_id: str) -> SourceDocumentRec:
        def fn(cur: Any) -> SourceDocumentRec:
            cur.execute(
                "select d.id, s.code as source_code, d.paper_id, d.kind::text as kind, d.bucket::text as bucket, d.r2_key, "
                "d.original_filename, d.mime_type, d.bytes, d.sha256, d.page_count "
                "from source_documents d join sources s on s.id = d.source_id where d.id = %s::uuid",
                (document_id,),
            )
            row = cur.fetchone()
            if row is None:
                raise KeyError(f"source document {document_id} not found")
            return SourceDocumentRec(
                **{**row, "id": str(row["id"]), "paper_id": str(row["paper_id"]) if row["paper_id"] else None}
            )

        return run(self.url, fn)

    def set_page_count(self, document_id: str, page_count: int) -> None:
        run(
            self.url,
            lambda cur: cur.execute(
                "update source_documents set page_count = %s where id = %s::uuid", (page_count, document_id)
            ),
        )

    def upsert_source_question(self, sq: SourceQuestionIn) -> str:
        def fn(cur: Any) -> str:
            cur.execute(
                "insert into source_questions (source_document_id, job_id, question_number, external_question_id, "
                "page_start, page_end, status, normalized, normalized_text, content_hash, extraction_method, "
                "ocr_mean_confidence, warnings, duplicate_of_question_id, possible_duplicate_of, duplicate_similarity) "
                "values (%s::uuid, %s::uuid, %s, %s, %s, %s, %s::source_question_status, %s, %s, %s, %s, %s, %s, "
                "%s::uuid, %s::uuid, %s) "
                "on conflict (source_document_id, question_number) do update set "
                "job_id = excluded.job_id, external_question_id = excluded.external_question_id, "
                "page_start = excluded.page_start, page_end = excluded.page_end, status = excluded.status, "
                "normalized = excluded.normalized, normalized_text = excluded.normalized_text, "
                "content_hash = excluded.content_hash, extraction_method = excluded.extraction_method, "
                "ocr_mean_confidence = excluded.ocr_mean_confidence, warnings = excluded.warnings, "
                "duplicate_of_question_id = excluded.duplicate_of_question_id, "
                "possible_duplicate_of = excluded.possible_duplicate_of, "
                "duplicate_similarity = excluded.duplicate_similarity, updated_at = now() "
                "where source_questions.status <> 'PROMOTED' returning id",
                (
                    sq.source_document_id,
                    sq.job_id,
                    sq.question_number,
                    sq.external_question_id,
                    sq.page_start,
                    sq.page_end,
                    sq.status,
                    Jsonb(sq.normalized),
                    sq.normalized_text,
                    sq.content_hash,
                    sq.extraction_method,
                    sq.ocr_mean_confidence,
                    sq.warnings,
                    sq.duplicate_of_question_id,
                    sq.possible_duplicate_of,
                    sq.duplicate_similarity,
                ),
            )
            row = cur.fetchone()
            if row is None:  # already PROMOTED: leave untouched
                cur.execute(
                    "select id from source_questions where source_document_id = %s::uuid and question_number = %s",
                    (sq.source_document_id, sq.question_number),
                )
                row = cur.fetchone()
            return str(row["id"])

        return run(self.url, fn)

    def insert_asset(self, a: AssetIn) -> str:
        def fn(cur: Any) -> str:
            # LIMITATION: question_assets has a single source_question_id column and unique (bucket, r2_key), and keys are
            # content-addressed. Two source questions sharing identical image bytes therefore share ONE row, owned by the
            # first source question; the second is not linked (no reassignment, which would steal it). Fixing that needs a
            # schema change (e.g. a join table), deliberately not done here.
            cur.execute(
                "insert into question_assets (source_question_id, kind, bucket, r2_key, mime_type, width, height, bytes, "
                "sha256, alt_text) values (%s::uuid, %s::asset_kind, %s::storage_bucket, %s, %s, %s, %s, %s, %s, %s) "
                "on conflict (bucket, r2_key) do nothing "
                "returning id",
                (
                    a.source_question_id,
                    a.kind,
                    a.bucket,
                    a.r2_key,
                    a.mime_type,
                    a.width,
                    a.height,
                    a.bytes,
                    a.sha256,
                    a.alt_text,
                ),
            )
            row = cur.fetchone()
            if row is None:  # conflict: existing row is kept untouched
                cur.execute(
                    "select id from question_assets where bucket = %s::storage_bucket and r2_key = %s",
                    (a.bucket, a.r2_key),
                )
                row = cur.fetchone()
            return str(row["id"])

        return run(self.url, fn)

    def exact_duplicates(self, content_hash: str, *, exclude_source_document_id: str | None = None) -> list[str]:
        def fn(cur: Any) -> list[str]:
            cur.execute(
                "select q.id from questions q where q.content_hash = %(h)s and not exists ("
                "  select 1 from source_questions s where s.id = q.source_question_id "
                "  and s.source_document_id = %(d)s::uuid) "
                "union "
                "select s.promoted_question_id from source_questions s where s.content_hash = %(h)s "
                "and s.promoted_question_id is not null and s.source_document_id is distinct from %(d)s::uuid",
                {"h": content_hash, "d": exclude_source_document_id},
            )
            return [str(r["id"]) if "id" in r else str(r["promoted_question_id"]) for r in cur.fetchall()]

        return run(self.url, fn)

    def near_duplicates(
        self, normalized_text: str, threshold: float, *, exclude_source_document_id: str | None = None
    ) -> list[tuple[str, float]]:
        def fn(cur: Any) -> list[tuple[str, float]]:
            cur.execute(
                "select n.question_id, n.similarity from app_private.find_near_duplicates(%s, %s::real, 5) n "
                "where not exists (select 1 from source_questions s where s.promoted_question_id = n.question_id "
                "and s.source_document_id = %s::uuid) order by n.similarity desc",
                (normalized_text, threshold, exclude_source_document_id),
            )
            return [(str(r["question_id"]), float(r["similarity"])) for r in cur.fetchall()]

        return run(self.url, fn)

    def upsert_official_keys(self, rows: list[OfficialKeyIn]) -> int:
        def fn(cur: Any) -> int:
            for r in rows:
                cur.execute(
                    "insert into official_answer_keys (source_document_id, paper_id, question_number, "
                    "external_question_id, raw_answer, normalized_answer, is_dropped) "
                    "values (%s::uuid, %s::uuid, %s, %s, %s, %s, %s) "
                    "on conflict (paper_id, question_number, external_question_id) do update set "
                    "source_document_id = excluded.source_document_id, raw_answer = excluded.raw_answer, "
                    "normalized_answer = excluded.normalized_answer, is_dropped = excluded.is_dropped",
                    (
                        r.source_document_id,
                        r.paper_id,
                        r.question_number,
                        r.external_question_id,
                        r.raw_answer,
                        Jsonb(r.normalized_answer),
                        r.is_dropped,
                    ),
                )
            return len(rows)

        return run(self.url, fn)

    def list_source_questions(self, document_id: str, status: str | None = None) -> list[SourceQuestionRec]:
        def fn(cur: Any) -> list[SourceQuestionRec]:
            cur.execute(
                "select id, source_document_id, question_number, status::text as status, warnings, "
                "possible_duplicate_of, duplicate_of_question_id, promoted_question_id, "
                "normalized->>'section_hint' as section_hint from source_questions "
                "where source_document_id = %s::uuid and (%s::text is null or status::text = %s) order by created_at, id",
                (document_id, status, status),
            )
            out = []
            for r in cur.fetchall():
                out.append(
                    SourceQuestionRec(
                        id=str(r["id"]),
                        source_document_id=str(r["source_document_id"]),
                        question_number=r["question_number"],
                        status=r["status"],
                        warnings=list(r["warnings"] or []),
                        possible_duplicate_of=str(r["possible_duplicate_of"]) if r["possible_duplicate_of"] else None,
                        duplicate_of_question_id=(
                            str(r["duplicate_of_question_id"]) if r["duplicate_of_question_id"] else None
                        ),
                        promoted_question_id=str(r["promoted_question_id"]) if r["promoted_question_id"] else None,
                        section_hint=r["section_hint"],
                    )
                )
            return out

        return run(self.url, fn)

    def promote(self, source_question_id: str, exam_id: str, subject_code: str | None) -> str:
        def fn(cur: Any) -> str:
            cur.execute(
                "select app_private.promote_source_question(%s::uuid, %s::uuid, %s) as id",
                (source_question_id, exam_id, subject_code),
            )
            return str(cur.fetchone()["id"])

        return run(self.url, fn)

    def link_keys(self, paper_id: str) -> int:
        def fn(cur: Any) -> int:
            cur.execute("select app_private.link_official_answer_keys(%s::uuid) as n", (paper_id,))
            return int(cur.fetchone()["n"])

        return run(self.url, fn)
