"""Validated row -> the rows to insert (pure, no DB access; unit-testable)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from pxw.content.latex import blocks_to_text, split_blocks
from pxw.content.schema import OPTION_LABELS
from pxw.content.validate import RowResult

# Mirrors app_private.promote_source_question (0007): origin is derived from the source kind.
ORIGIN_BY_KIND = {
    "OFFICIAL_EXAM_BODY": "PYQ",
    "LICENSED_PUBLISHER": "PYQ",
    "EDITORIAL_TEAM": "EDITORIAL",
}


def origin_for_kind(kind: str) -> str:
    return ORIGIN_BY_KIND.get(kind, "AI_GENERATED")


@dataclass
class BuiltQuestion:
    question: dict[str, Any]
    options: list[dict[str, Any]] = field(default_factory=list)
    solution: dict[str, Any] | None = None
    audit: dict[str, Any] = field(default_factory=dict)


def build_answer_key(r: RowResult, option_ids: dict[str, str]) -> dict[str, Any]:
    """AnswerKey in the contract shape (packages/contracts domain/answers.ts)."""
    assert r.answer_key is not None and r.row is not None
    if r.answer_key["type"] == "NUMERICAL":
        return {
            "type": "NUMERICAL",
            "accepted_ranges": r.answer_key["accepted_ranges"],
            "display_value": r.answer_key["display_value"],
        }
    return {"type": r.answer_key["type"], "correct_option_ids": [option_ids[lb] for lb in r.answer_key["labels"]]}


def build_question(r: RowResult, *, batch_id: str, file_name: str | None = None) -> BuiltQuestion:
    row, res, src = r.row, r.resolution, r.source
    assert row is not None and res is not None and src is not None and r.content_hash is not None
    qid = str(uuid.uuid4())
    is_ai = src.kind == "AI_GENERATION"

    options: list[dict[str, Any]] = []
    option_ids: dict[str, str] = {}
    if row.qtype != "NUMERICAL":
        for i, (label, text) in enumerate(zip(OPTION_LABELS, row.options or [], strict=True)):
            oid = str(uuid.uuid4())
            option_ids[label] = oid
            content = split_blocks(text)
            options.append(
                {
                    "id": oid,
                    "question_id": qid,
                    "label": label,
                    "sort_order": i,
                    "content": content,
                    "content_text": blocks_to_text(content),
                }
            )
    key = build_answer_key(r, option_ids)

    paper = r.paper
    year = row.year if row.year is not None else (paper.year if paper else None)
    question = {
        "id": qid,
        "exam_id": res.exam_id,
        "subject_id": res.subject_id,
        "chapter_id": res.chapter_id,
        "topic_id": res.topic_id,
        "paper_id": paper.id if paper else None,
        "origin": origin_for_kind(src.kind),
        "question_type": row.qtype,
        "difficulty": row.difficulty,
        "year": year,
        "shift": paper.shift if paper else None,
        "session_label": paper.session_label if paper else None,
        "question_number": row.question_number,
        "question_text": row.stem,
        "structured_content": split_blocks(row.stem),
        # questions_answer_key_source_pair: key and source are both set or both null. There is no source value for
        # "one AI said so" (AI_CONSENSUS would be a false claim), so AI-generated answers are not stored as a key.
        "answer_key": None if is_ai else key,
        "answer_key_source": None if is_ai else "HUMAN",
        "source_id": src.id,
        "content_hash": r.content_hash,
        "dedupe_text": r.normalized_text,
        "ingestion_status": "IMPORTED",
        "verification_status": "HUMAN_REVIEW_REQUIRED",
        "publication_status": "DRAFT",
    }

    solution = None
    if row.solution:
        solution = {
            "question_id": qid,
            "final_answer": key,
            "steps": [{"index": 1, "title": None, "blocks": split_blocks(row.solution)}],
            "provenance": "AI_GENERATED" if is_ai else "HUMAN_AUTHORED",
            "edit_note": f"Imported from {file_name or 'content file'} (source {src.code}); needs review before approval",
        }

    audit = {
        "batch_id": batch_id,
        "file": file_name,
        "row": r.index,
        "source": src.code,
        "source_ref": row.source_ref,
        "licence": row.licence,
        "external_id": row.external_id,
        "notes": row.notes,
        "content_hash": r.content_hash,
    }
    if is_ai:
        audit["unstored_answer"] = row.answer
    return BuiltQuestion(question=question, options=options, solution=solution, audit=audit)
