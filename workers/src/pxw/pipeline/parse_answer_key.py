"""PARSE_ANSWER_KEY: PDF -> OfficialKeyIn rows -> upsert -> link."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pxw.answer_keys.parse import extract_key_lines, parse_key_lines
from pxw.common.errors import ChecksumMismatch
from pxw.common.hashing import sha256_hex
from pxw.common.jsonio import atomic_write_bytes
from pxw.common.models import OfficialKeyIn
from pxw.db.repo import IngestionRepo
from pxw.jobs.runner import JobContext
from pxw.storage.base import ObjectStore


def parse_key_pdf(
    pdf_path: Path, paper_id: str, source_document_id: str
) -> tuple[list[OfficialKeyIn], list[str]]:
    rows, unparsed = parse_key_lines(extract_key_lines(pdf_path))
    keys = [
        OfficialKeyIn(paper_id=paper_id, source_document_id=source_document_id, **r)
        for r in rows
    ]
    return keys, unparsed


def run_parse_answer_key(
    payload: dict[str, Any],
    *,
    repo: IngestionRepo,
    objects: ObjectStore,
    work_dir: Path,
    job: JobContext | None = None,
) -> dict[str, Any]:
    doc = repo.get_document(payload["source_document_id"])
    repo.get_source(doc.source_code)  # SourceNotApproved -> permanent failure
    paper_id = payload.get("paper_id") or doc.paper_id
    if not paper_id:
        raise ValueError("PARSE_ANSWER_KEY needs a paper_id (payload or document)")
    data = objects.get("SOURCE_DOCS", doc.r2_key)
    if sha256_hex(data) != doc.sha256:
        raise ChecksumMismatch(f"document {doc.id}: sha256 mismatch")
    pdf = work_dir / doc.sha256 / "original.pdf"
    atomic_write_bytes(pdf, data)
    keys, unparsed = parse_key_pdf(pdf, paper_id, doc.id)
    if job:
        job.heartbeat()
        for line in unparsed:
            job.log("WARN", "parse", "unparsed answer-key row", {"row": line})
    upserted = repo.upsert_official_keys(keys)
    linked = repo.link_keys(paper_id)
    if job:
        job.log("INFO", "link", "answer keys linked", {"rows": len(keys), "upserted": upserted, "linked": linked})
    return {"rows": len(keys), "upserted": upserted, "linked": linked, "unparsed_rows": unparsed}
