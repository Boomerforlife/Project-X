"""PROCESS_DOCUMENT: fetch -> extract -> ocr -> segment -> figures -> normalize -> dedupe -> persist -> promote."""

from __future__ import annotations

import copy
import shutil
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pxw.common.errors import ChecksumMismatch, UnsupportedLayout
from pxw.common.hashing import sha256_hex
from pxw.common.jsonio import atomic_write_bytes, atomic_write_json
from pxw.common.models import AssetIn, Source, SourceQuestionIn, Warning
from pxw.db.repo import IngestionRepo
from pxw.dedupe.dedupe import run_dedupe
from pxw.extraction.figures import capture_figures
from pxw.extraction.jee_adv_crop import LAYOUT_NAME as JEE_ADV_LAYOUT
from pxw.extraction.jee_adv_crop import extract_jee_adv
from pxw.extraction.layout_profiles import detect_profile, get_profile
from pxw.extraction.neet_booklet import extract_neet_booklet
from pxw.extraction.nta_cbt_image import LAYOUT_NAME as NTA_IMAGE_LAYOUT
from pxw.extraction.nta_cbt_image import extract_nta_cbt_image
from pxw.extraction.nta_cbt_image import looks_like as looks_like_nta_image
from pxw.extraction.pdf import OCR_DPI, extract_pages, open_pdf, order_lines, render_page_png
from pxw.extraction.segment import segment_lines, strip_headers_footers
from pxw.jobs.runner import JobContext
from pxw.normalize.normalize import normalize_all
from pxw.ocr.chain import OcrChain
from pxw.pipeline.stages import StageReport, input_key, run_cached_stage
from pxw.storage.base import ObjectStore


@dataclass
class PipelineContext:
    work_dir: Path
    ocr: OcrChain
    min_confidence: float = 0.6
    repo: IngestionRepo | None = None
    objects: ObjectStore | None = None
    job: JobContext | None = None
    on_stage: Callable[[StageReport], None] | None = None
    stop_after: str | None = None


@dataclass
class DocumentInput:
    document_id: str
    sha256: str
    get_bytes: Callable[[], bytes]
    source_code: str | None = None


# --- stage bodies ---------------------------------------------------------------------------------


def _fetch(doc: DocumentInput, doc_dir: Path) -> dict[str, Any]:
    data = doc.get_bytes()
    if sha256_hex(data) != doc.sha256:
        raise ChecksumMismatch(f"document {doc.document_id}: sha256 of fetched bytes != registered sha256")
    atomic_write_bytes(doc_dir / "original.pdf", data)
    pdf = open_pdf(doc_dir / "original.pdf")
    try:
        pages = pdf.page_count
    finally:
        pdf.close()
    return {"sha256": doc.sha256, "bytes": len(data), "page_count": pages, "path": "original.pdf"}


def _ocr(pdf_path: Path, extract: dict[str, Any], chain: OcrChain) -> dict[str, Any]:
    scale = 72.0 / OCR_DPI
    pages: dict[str, Any] = {}
    todo = [p for p in extract["pages"] if p["needs_ocr"]]
    if todo:
        pdf = open_pdf(pdf_path)
        try:
            for p in todo:
                png = render_page_png(pdf, p["page"] - 1, OCR_DPI)
                res = chain.recognize(png)
                lines = [
                    {
                        "page": p["page"],
                        "text": ln.text.strip(),
                        "bbox": [round(v * scale, 2) for v in ln.bbox],
                        "source": "OCR",
                        "conf": round(ln.confidence, 4),
                        "size": None,
                        "font": "",
                    }
                    for ln in res.lines
                    if ln.text.strip()
                ]
                pages[str(p["page"])] = {
                    "engine": res.engine,
                    "mean_confidence": round(res.mean_confidence, 4),
                    "warnings": list(chain.last_warnings),
                    "tried": list(chain.last_tried),
                    "lines": order_lines(lines),
                }
        finally:
            pdf.close()
    return {"pages": pages}


def _segment(extract: dict[str, Any], ocr: dict[str, Any], layout: str) -> dict[str, Any]:
    lines: list[dict[str, Any]] = []
    for p in extract["pages"]:
        o = ocr["pages"].get(str(p["page"]))
        lines.extend(o["lines"] if o and o["lines"] else p["lines"])
    lines = strip_headers_footers(lines, extract["page_count"], {p["page"]: p["height"] for p in extract["pages"]})
    name = detect_profile(lines) if layout == "auto" else layout
    spec = get_profile(name)  # UnsupportedLayout (permanent) for unknown profiles
    questions = segment_lines(lines, spec)
    if not questions:
        raise UnsupportedLayout(f"layout {name!r} found no questions in this document")
    return {"layout": name, "questions": questions, "n_lines": len(lines)}


def apply_decision(q: dict[str, Any], decision: dict[str, Any]) -> dict[str, Any]:
    """Merge dedupe warnings into a copy of the NormalizedQuestion."""
    out = copy.deepcopy(q)
    warns = list(out["extraction"]["warnings"])
    for w in decision["warnings"]:
        if w not in warns:
            warns.append(w)
    out["extraction"]["warnings"] = warns
    return out


# --- orchestration --------------------------------------------------------------------------------


def run_document(
    doc: DocumentInput,
    ctx: PipelineContext,
    *,
    layout: str = "auto",
    exam_id: str | None = None,
    auto_promote: bool = False,
) -> dict[str, Any]:
    """Run all stages. With ctx.repo=None only the offline stages (and in-batch dedupe) run."""
    doc_dir = ctx.work_dir / doc.sha256
    doc_dir.mkdir(parents=True, exist_ok=True)
    reports: list[StageReport] = []

    def after(rep: StageReport) -> None:
        reports.append(rep)
        if ctx.job:
            ctx.job.heartbeat()
            ctx.job.log("INFO", rep.stage, "stage done", rep.to_dict())
        if ctx.on_stage:
            ctx.on_stage(rep)

    pdf_path = doc_dir / "original.pdf"
    kw = {"after": after, "stop_after": ctx.stop_after}

    fetch, fetch_h, _ = run_cached_stage(
        doc_dir,
        "fetch",
        input_key("fetch", doc.sha256),
        lambda: _fetch(doc, doc_dir),
        lambda p: {"bytes": p["bytes"], "pages": p["page_count"]},
        valid=lambda p: pdf_path.is_file() and pdf_path.stat().st_size == p["bytes"]
        and sha256_hex(pdf_path.read_bytes()) == doc.sha256,
        **kw,
    )
    extract, extract_h, _ = run_cached_stage(
        doc_dir,
        "extract",
        input_key("extract", fetch_h),
        lambda: extract_pages(pdf_path),
        lambda p: {
            "pages": p["page_count"],
            "lines": sum(len(x["lines"]) for x in p["pages"]),
            "needs_ocr": sum(1 for x in p["pages"] if x["needs_ocr"]),
        },
        **kw,
    )
    # NTA computer-based-test papers keep the question content in images: crop questions/options directly.
    if layout == NTA_IMAGE_LAYOUT or (layout == "auto" and looks_like_nta_image(pdf_path)):
        return _run_nta_image(doc, ctx, pdf_path, doc_dir, fetch, extract_h, reports, after, kw,
                              exam_id=exam_id, auto_promote=auto_promote)
    # NEET printed booklets (English-medium codes): two columns, each question cropped with its options.
    if layout == "neet_booklet":
        return _run_nta_image(doc, ctx, pdf_path, doc_dir, fetch, extract_h, reports, after, kw,
                              exam_id=exam_id, auto_promote=auto_promote, stage="neet_booklet",
                              extractor=lambda: extract_neet_booklet(pdf_path, doc.document_id, doc_dir / "crops"))
    # NTA papers NTA took down, fetched from a mirror: same NTA layout, mirror watermark stripped first.
    if layout == "nta_cbt_mirror":
        return _run_nta_image(doc, ctx, pdf_path, doc_dir, fetch, extract_h, reports, after, kw,
                              exam_id=exam_id, auto_promote=auto_promote, stage="nta_mirror",
                              extractor=lambda: extract_nta_cbt_image(pdf_path, doc.document_id, doc_dir / "crops",
                                                                      ocr=_ocr_text(ctx.ocr), strip_marks=True))
    # JEE Advanced archive booklets (text-layer or scanned): crop each question with its options as printed.
    if layout == JEE_ADV_LAYOUT:
        return _run_nta_image(doc, ctx, pdf_path, doc_dir, fetch, extract_h, reports, after, kw,
                              exam_id=exam_id, auto_promote=auto_promote, stage="jee_adv",
                              extractor=lambda: extract_jee_adv(pdf_path, doc.document_id, doc_dir / "crops",
                                                                ocr_page=_ocr_lines(ctx.ocr)))

    engines = [e.name for e in ctx.ocr.engines]
    ocr, ocr_h, _ = run_cached_stage(
        doc_dir,
        "ocr",
        input_key("ocr", extract_h, engines, ctx.ocr.min_confidence),
        lambda: _ocr(pdf_path, extract, ctx.ocr),
        lambda p: {"pages_ocr": len(p["pages"])},
        **kw,
    )
    seg, seg_h, _ = run_cached_stage(
        doc_dir,
        "segment",
        input_key("segment", extract_h, ocr_h, layout),
        lambda: _segment(extract, ocr, layout),
        lambda p: {"questions": len(p["questions"]), "layout": p["layout"]},
        **kw,
    )
    figs, figs_h, _ = run_cached_stage(
        doc_dir,
        "figures",
        input_key("figures", seg_h, doc.document_id),
        lambda: {"assets": capture_figures(pdf_path, seg["questions"], doc.document_id, doc_dir / "crops")},
        lambda p: {"assets": sum(len(v) for v in p["assets"].values())},
        valid=lambda p: all((doc_dir / "crops" / a["file"]).is_file() for v in p["assets"].values() for a in v),
        **kw,
    )

    page_engines = {int(k): v["engine"] for k, v in ocr["pages"].items()}
    page_warnings = {
        int(k): [Warning.OCR_UNAVAILABLE.value] for k, v in ocr["pages"].items() if Warning.OCR_UNAVAILABLE.value in v["warnings"]
    }
    questions, _, _ = run_cached_stage(
        doc_dir,
        "normalize",
        input_key("normalize", seg_h, figs_h, ctx.min_confidence),
        lambda: {
            "questions": normalize_all(
                seg["questions"],
                figs["assets"],
                min_confidence=ctx.min_confidence,
                page_engines=page_engines,
                page_warnings=page_warnings,
            )
        },
        lambda p: {"questions": len(p["questions"])},
        **kw,
    )
    normalized: list[dict[str, Any]] = questions["questions"]

    # 7 dedupe (DB dependent, always runs)
    t0 = time.monotonic()
    decisions = run_dedupe(normalized, ctx.repo, doc.document_id if ctx.repo else None)
    finals = [apply_decision(q, d) for q, d in zip(normalized, decisions, strict=True)]
    after(
        StageReport(
            "dedupe",
            False,
            int((time.monotonic() - t0) * 1000),
            {
                "duplicates": sum(d["status"] == "DUPLICATE" for d in decisions),
                "possible": sum(bool(d["warnings"]) for d in decisions),
            },
        )
    )

    result: dict[str, Any] = {
        "document_id": doc.document_id,
        "sha256": doc.sha256,
        "layout": seg["layout"],
        "page_count": fetch["page_count"],
        "questions": len(finals),
        "ocr_pages": len(ocr["pages"]),
        "ocr_warnings": sorted({w for v in ocr["pages"].values() for w in v["warnings"]}),
        "stages": [r.to_dict() for r in reports],
        "_questions": finals,
        "_decisions": decisions,
        "_doc_dir": str(doc_dir),
    }
    if ctx.repo is None:
        return result

    persisted, promoted = persist_and_promote(
        doc, ctx, doc_dir, finals, decisions, exam_id=exam_id, auto_promote=auto_promote, after=after,
        page_count=fetch["page_count"],
    )
    result["persisted"] = persisted
    result["promoted"] = promoted
    result["stages"] = [r.to_dict() for r in reports]
    return result


def _ocr_lines(chain: OcrChain) -> Callable[[bytes], list[tuple[str, tuple[float, float, float, float]]]]:
    """Whole-page OCR as (text, pixel bbox) lines; empty when no engine is configured."""
    def run(png: bytes) -> list[tuple[str, tuple[float, float, float, float]]]:
        r = chain.recognize(png)
        return [] if r.engine == "none" else [(ln.text, tuple(ln.bbox)) for ln in r.lines]  # type: ignore[misc]

    return run


def _ocr_text(chain: OcrChain) -> Callable[[bytes], tuple[str, float | None, str | None]]:
    def run(png: bytes) -> tuple[str, float | None, str | None]:
        r = chain.recognize(png)
        if r.engine == "none":
            return "", None, None
        return " ".join(line.text for line in r.lines).strip(), r.mean_confidence, r.engine

    return run


def _run_nta_image(
    doc: DocumentInput,
    ctx: PipelineContext,
    pdf_path: Path,
    doc_dir: Path,
    fetch: dict[str, Any],
    extract_h: str,
    reports: list[StageReport],
    after: Callable[[StageReport], None],
    kw: dict[str, Any],
    *,
    exam_id: str | None,
    auto_promote: bool,
    stage: str = "nta_image",
    extractor: Callable[[], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Layouts whose questions are stored as page crops (NTA CBT papers, JEE Advanced booklets)."""
    engines = [e.name for e in ctx.ocr.engines]
    nta, _, _ = run_cached_stage(
        doc_dir,
        stage,
        input_key(stage, extract_h, doc.document_id, engines),
        extractor or (lambda: extract_nta_cbt_image(pdf_path, doc.document_id, doc_dir / "crops", ocr=_ocr_text(ctx.ocr))),
        lambda p: {**p["stats"], "layout": p["layout"]},
        valid=lambda p: all((doc_dir / "crops" / a["r2_key"].rsplit("/", 1)[-1]).is_file() for q in p["questions"] for a in q["assets"]),
        **kw,
    )
    normalized: list[dict[str, Any]] = nta["questions"]
    t0 = time.monotonic()
    decisions = run_dedupe(normalized, ctx.repo, doc.document_id if ctx.repo else None,
                           check_batch=stage != "jee_adv")
    finals = [apply_decision(q, d) for q, d in zip(normalized, decisions, strict=True)]
    after(StageReport("dedupe", False, int((time.monotonic() - t0) * 1000), {
        "duplicates": sum(d["status"] == "DUPLICATE" for d in decisions),
        "possible": sum(bool(d["warnings"]) for d in decisions),
    }))
    result: dict[str, Any] = {
        "document_id": doc.document_id,
        "sha256": doc.sha256,
        "layout": nta["layout"],
        "page_count": fetch["page_count"],
        "questions": len(finals),
        "ocr_pages": 0,
        "ocr_warnings": [],
        "stages": [r.to_dict() for r in reports],
        "_questions": finals,
        "_decisions": decisions,
        "_doc_dir": str(doc_dir),
    }
    if ctx.repo is None:
        return result
    persisted, promoted = persist_and_promote(
        doc, ctx, doc_dir, finals, decisions, exam_id=exam_id, auto_promote=auto_promote, after=after,
        page_count=fetch["page_count"],
    )
    result["persisted"] = persisted
    result["promoted"] = promoted
    if nta.get("printed_answers"):
        result["printed_answers"] = _link_printed_answers(doc, ctx, finals, nta["printed_answers"])
    result["stages"] = [r.to_dict() for r in reports]
    return result


def _link_printed_answers(
    doc: DocumentInput, ctx: PipelineContext, finals: list[dict[str, Any]], printed: dict[str, str]
) -> dict[str, Any]:
    """Answers the board printed in its own booklet become official keys, linked by our external question ids.
    The source document of these keys is the question paper itself."""
    from pxw.answer_keys.printed import normalize_printed_answer
    from pxw.common.models import OfficialKeyIn

    assert ctx.repo is not None
    m = ctx.repo.document_question_map(doc.document_id)
    if m is None:
        return {"status": "document has no paper"}
    paper_id, qmap = m
    types = {q.get("external_question_id"): q.get("question_type_guess") for q in finals}
    ins = []
    for ext_id, raw in printed.items():
        if ext_id not in qmap:
            continue  # question not promoted (duplicate, dropped, or not extracted)
        norm = normalize_printed_answer(raw, types.get(ext_id))
        ins.append(OfficialKeyIn(paper_id=paper_id, source_document_id=doc.document_id, external_question_id=ext_id,
                                 raw_answer=raw, normalized_answer=norm, is_dropped=norm["kind"] == "DROPPED"))
    stored = ctx.repo.upsert_official_keys(ins) if ins else 0
    linked = ctx.repo.link_keys(paper_id)
    return {"printed": len(printed), "matched": len(ins), "stored": stored, "linked": linked,
            "dropped": sum(1 for x in ins if x.is_dropped)}


def persist_and_promote(
    doc: DocumentInput,
    ctx: PipelineContext,
    doc_dir: Path,
    finals: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
    *,
    exam_id: str | None,
    auto_promote: bool,
    after: Callable[[StageReport], None],
    page_count: int,
) -> tuple[dict[str, int], int]:
    repo = ctx.repo
    assert repo is not None
    t0 = time.monotonic()
    job_id = ctx.job.job.id if ctx.job else None
    repo.set_page_count(doc.document_id, page_count)
    statuses: dict[str, int] = {}
    sq_ids: list[str] = []
    for q, d in zip(finals, decisions, strict=True):
        if ctx.objects is not None:
            for a in q["assets"]:
                if not ctx.objects.exists("SOURCE_DOCS", a["r2_key"]):
                    png = (doc_dir / "crops" / a["r2_key"].rsplit("/", 1)[-1]).read_bytes()
                    ctx.objects.put("SOURCE_DOCS", a["r2_key"], png, "image/png")
        base = {
            "source_document_id": doc.document_id,
            "job_id": job_id,
            "question_number": q["question_number"],
            "external_question_id": q["external_question_id"],
            "page_start": q["page_start"],
            "page_end": q["page_end"],
            "status": d["status"],
            "normalized_text": q["normalized_text"],
            "content_hash": q["content_hash"],
            "extraction_method": q["extraction"]["method"],
            "ocr_mean_confidence": q["extraction"]["mean_confidence"],
            "warnings": q["extraction"]["warnings"],
            "duplicate_of_question_id": d["duplicate_of_question_id"],
            "possible_duplicate_of": d["possible_duplicate_of"],
            "duplicate_similarity": d["duplicate_similarity"],
        }
        sid = repo.upsert_source_question(SourceQuestionIn(normalized=q, **base))
        if q["assets"]:
            stored = copy.deepcopy(q)
            for a in stored["assets"]:
                a["asset_id"] = repo.insert_asset(
                    AssetIn(
                        source_question_id=sid,
                        kind=a["kind"],
                        bucket="SOURCE_DOCS",
                        r2_key=a["r2_key"],
                        mime_type=a["mime_type"],
                        width=a["width"],
                        height=a["height"],
                        bytes=None,
                        sha256=a["sha256"],
                        alt_text=None,
                    )
                )
            repo.upsert_source_question(SourceQuestionIn(normalized=stored, **base))
        statuses[d["status"]] = statuses.get(d["status"], 0) + 1
        sq_ids.append(sid)
    after(StageReport("persist", False, int((time.monotonic() - t0) * 1000), {"source_questions": len(sq_ids), **statuses}))

    t0 = time.monotonic()
    promoted = 0
    if auto_promote and exam_id:
        for sid, q, d in zip(sq_ids, finals, decisions, strict=True):
            if d["status"] == "NORMALIZED" and not q["extraction"]["warnings"] and d["possible_duplicate_of"] is None:
                repo.promote(sid, exam_id, None)
                promoted += 1
    after(StageReport("promote", False, int((time.monotonic() - t0) * 1000), {"promoted": promoted}))
    return statuses, promoted


# --- offline bundle -------------------------------------------------------------------------------


def write_bundle(out_dir: Path, result: dict[str, Any]) -> Path:
    """Offline output: normalized_questions.json (NormalizedQuestion[]) + crops/*.png."""
    out_dir.mkdir(parents=True, exist_ok=True)
    questions = result["_questions"]
    path = out_dir / "normalized_questions.json"
    atomic_write_json(path, questions)
    crops_src = Path(result["_doc_dir"]) / "crops"
    if crops_src.is_dir():
        (out_dir / "crops").mkdir(exist_ok=True)
        for f in crops_src.glob("*.png"):
            shutil.copyfile(f, out_dir / "crops" / f.name)
    return path


def check_source(repo: IngestionRepo, source_code: str) -> Source:
    return repo.get_source(source_code)
