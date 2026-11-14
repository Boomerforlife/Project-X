"""Job handlers wiring PROCESS_DOCUMENT / PARSE_ANSWER_KEY to the pipeline."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from pxw.common.models import Job
from pxw.db.repo import IngestionRepo
from pxw.jobs.runner import Handler, JobContext
from pxw.ocr.chain import OcrChain
from pxw.pipeline.parse_answer_key import run_parse_answer_key
from pxw.pipeline.process_document import DocumentInput, PipelineContext, run_document
from pxw.storage.base import ObjectStore


def make_handlers(
    repo: IngestionRepo, objects: ObjectStore, ocr: OcrChain, work_dir: Path
) -> dict[str, Handler]:
    def process_document(job: Job, jctx: JobContext) -> dict[str, Any]:
        p = job.payload
        rec = repo.get_document(p["source_document_id"])
        repo.get_source(rec.source_code)  # re-check approval at processing time (SourceNotApproved -> permanent)
        doc = DocumentInput(rec.id, rec.sha256, lambda: objects.get("SOURCE_DOCS", rec.r2_key), rec.source_code)
        ctx = PipelineContext(
            work_dir=work_dir,
            ocr=ocr,
            min_confidence=ocr.min_confidence,
            repo=repo,
            objects=objects,
            job=jctx,
        )
        res = run_document(
            doc,
            ctx,
            layout=p.get("layout_profile") or "auto",
            exam_id=p.get("exam_id"),
            auto_promote=bool(p.get("auto_promote")),
        )
        return {k: v for k, v in res.items() if not k.startswith("_")}

    def parse_answer_key(job: Job, jctx: JobContext) -> dict[str, Any]:
        return run_parse_answer_key(job.payload, repo=repo, objects=objects, work_dir=work_dir, job=jctx)

    return {"PROCESS_DOCUMENT": process_document, "PARSE_ANSWER_KEY": parse_answer_key}
