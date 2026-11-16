"""IngestionRepo protocol (writes source docs / questions / keys / assets)."""

from __future__ import annotations

from typing import Protocol

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


class IngestionRepo(Protocol):
    def get_source(self, code: str) -> Source:
        """Raises SourceNotApproved unless reuse_permitted and approved_at is set."""
        ...

    def upsert_paper(self, paper: PaperIn) -> str: ...

    def register_document(self, doc: SourceDocumentIn) -> tuple[str, bool]: ...

    def upsert_source_question(self, sq: SourceQuestionIn) -> str: ...

    def insert_asset(self, a: AssetIn) -> str: ...

    def exact_duplicates(self, content_hash: str, *, exclude_source_document_id: str | None = None) -> list[str]: ...

    def near_duplicates(
        self, normalized_text: str, threshold: float, *, exclude_source_document_id: str | None = None
    ) -> list[tuple[str, float]]: ...

    def upsert_official_keys(self, rows: list[OfficialKeyIn]) -> int: ...

    def promote(self, source_question_id: str, exam_id: str, subject_code: str | None) -> str: ...

    def link_keys(self, paper_id: str) -> int: ...

    # --- helpers beyond the documented protocol (used by jobs / CLI) ---
    def get_document(self, document_id: str) -> SourceDocumentRec: ...

    def resolve_exam_id(self, exam_slug: str) -> str: ...

    def list_source_questions(self, document_id: str, status: str | None = None) -> list[SourceQuestionRec]: ...

    def set_page_count(self, document_id: str, page_count: int) -> None: ...

    def paper_question_map(self, paper_slug: str) -> tuple[str, dict[str, list[str]]] | None:
        """(paper_id, {external_question_id: [external option ids]}) for promoted questions of a paper, or None."""
        ...
