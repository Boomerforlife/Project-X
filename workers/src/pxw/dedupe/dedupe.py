"""Exact + near duplicate detection (INGESTION_PIPELINE section 6)."""

from __future__ import annotations

from typing import Any

from rapidfuzz import fuzz

from pxw.common.models import Warning
from pxw.db.repo import IngestionRepo

NEAR_DB_THRESHOLD = 0.90
NEAR_BATCH_THRESHOLD = 95.0


def run_dedupe(
    questions: list[dict[str, Any]],
    repo: IngestionRepo | None,
    source_document_id: str | None = None,
    *,
    db_threshold: float = NEAR_DB_THRESHOLD,
    batch_threshold: float = NEAR_BATCH_THRESHOLD,
) -> list[dict[str, Any]]:
    """One decision dict per question (same order):

    {status: NORMALIZED|DUPLICATE, duplicate_of_question_id, possible_duplicate_of, duplicate_similarity, warnings}
    Exact DB duplicate -> DUPLICATE. Near duplicates (DB trigram >= 0.90, or in-batch token_set_ratio >= 95) stay
    NORMALIZED but get a warning so they are never auto-promoted. In-batch matches have no question id to point at,
    so only the similarity and a warning are recorded.
    """
    decisions: list[dict[str, Any]] = []
    seen: list[tuple[str, str]] = []  # (question_number, normalized_text) of earlier questions in this batch
    for q in questions:
        d: dict[str, Any] = {
            "status": "NORMALIZED",
            "duplicate_of_question_id": None,
            "possible_duplicate_of": None,
            "duplicate_similarity": None,
            "warnings": [],
        }
        text = q["normalized_text"]
        exact = repo.exact_duplicates(q["content_hash"], exclude_source_document_id=source_document_id) if repo else []
        if exact:
            d["status"] = "DUPLICATE"
            d["duplicate_of_question_id"] = exact[0]
            d["duplicate_similarity"] = 1.0
        else:
            best_sim = 0.0
            if repo:
                near = repo.near_duplicates(text, db_threshold, exclude_source_document_id=source_document_id)
                if near:
                    d["possible_duplicate_of"], best_sim = near[0]
                    d["warnings"].append(Warning.POSSIBLE_DUPLICATE.value)
            for _num, other in seen:
                sim = fuzz.token_set_ratio(text, other)
                if sim >= batch_threshold and sim / 100.0 > best_sim:
                    best_sim = sim / 100.0
                    if Warning.POSSIBLE_DUPLICATE_IN_BATCH.value not in d["warnings"]:
                        d["warnings"].append(Warning.POSSIBLE_DUPLICATE_IN_BATCH.value)
            if best_sim:
                d["duplicate_similarity"] = round(best_sim, 4)
        seen.append((q["question_number"], text))
        decisions.append(d)
    return decisions
