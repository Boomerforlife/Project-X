"""pxw CLI. Exit codes: 0 ok, 2 usage/config, 3 source not approved, 4 job failed permanently, 1 other.

Machine-readable output is JSON lines on stdout; logs go to stderr.
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
import traceback
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pxw.common.errors import PermanentError, SourceNotApproved
from pxw.common.hashing import sha256_hex
from pxw.common.jsonio import atomic_write_json
from pxw.common.logging import configure_logging, emit
from pxw.common.models import PaperIn, SourceDocumentIn
from pxw.config import PIPELINE_VERSION, ConfigError, Settings
from pxw.ocr.base import OcrResult
from pxw.ocr.chain import OcrChain, build_engines
from pxw.ocr.mock import MockOcrEngine
from pxw.storage import keys
from pxw.storage.factory import make_object_store

EXIT_OK, EXIT_ERROR, EXIT_USAGE, EXIT_NOT_APPROVED, EXIT_JOB_FAILED = 0, 1, 2, 3, 4
_NIL_UUID = "00000000-0000-0000-0000-000000000000"
_NS = uuid.UUID("0b8f3b9e-6a0e-4c63-9f57-6f1f6f0a7d10")


@dataclass
class Runtime:
    settings: Settings
    jobs: Any
    repo: Any
    objects: Any


def _build_runtime(args: argparse.Namespace, settings: Settings) -> Runtime:
    store_kind = args.job_store or settings.job_store
    objects = make_object_store(settings, args.storage)
    if store_kind == "file":
        from pxw.db.file_repo import FileIngestionRepo
        from pxw.jobs.file_store import FileJobStore

        return Runtime(
            settings,
            FileJobStore(settings.work_dir / "jobs.json"),
            FileIngestionRepo(settings.work_dir / "db"),
            objects,
        )
    if store_kind == "postgres":
        if not settings.database_url:
            raise ConfigError("--job-store postgres needs DATABASE_URL")
        from pxw.db.pg_repo import PgIngestionRepo
        from pxw.jobs.pg_store import PgJobStore

        return Runtime(settings, PgJobStore(settings.database_url), PgIngestionRepo(settings.database_url), objects)
    raise ConfigError(f"unknown job store {store_kind!r} (file|postgres)")


def _ocr_chain(settings: Settings, engines_arg: str | None, fixtures: str | None = None) -> OcrChain:
    names = [x.strip() for x in engines_arg.split(",") if x.strip()] if engines_arg else settings.ocr_engines
    mock = None
    if "mock" in names:
        fx: dict[str, OcrResult] = {}
        if fixtures:
            raw = json.loads(Path(fixtures).read_text(encoding="utf-8"))
            fx = {sha: OcrResult.from_dict(v) for sha, v in raw.items()}
        mock = MockOcrEngine(fx)
    try:
        engines = build_engines(names, mock=mock)
    except ValueError as exc:
        raise ConfigError(str(exc)) from exc
    return OcrChain(engines, settings.ocr_min_confidence)


# --- commands -------------------------------------------------------------------------------------


def cmd_register(args: argparse.Namespace, settings: Settings) -> int:
    rt = _build_runtime(args, settings)
    source = rt.repo.get_source(args.source)  # SourceNotApproved -> exit 3
    path = Path(args.file)
    data = path.read_bytes()
    sha = sha256_hex(data)
    ext = path.suffix.lstrip(".").lower() or "pdf"
    page_count = None
    if ext == "pdf":
        import pymupdf

        with pymupdf.open(stream=data, filetype="pdf") as pdf:
            page_count = pdf.page_count
    paper_id = rt.repo.upsert_paper(
        PaperIn(
            slug=args.paper_slug,
            title=args.paper_title or args.paper_slug,
            year=args.year,
            exam_slug=args.exam,
            session_label=args.session,
            exam_date=args.exam_date,
            shift=args.shift,
            paper_code=args.paper_code,
        )
    )
    key = keys.source_document(source.code, args.year, sha, ext)
    if not rt.objects.exists("SOURCE_DOCS", key):
        rt.objects.put("SOURCE_DOCS", key, data, "application/pdf" if ext == "pdf" else "application/octet-stream")
    doc_id, created = rt.repo.register_document(
        SourceDocumentIn(
            source_code=source.code,
            paper_id=paper_id,
            kind=args.kind,
            r2_key=key,
            original_filename=path.name,
            mime_type="application/pdf",
            bytes=len(data),
            sha256=sha,
            page_count=page_count,
        )
    )
    if args.kind == "ANSWER_KEY":
        job_id = rt.jobs.enqueue(
            "PARSE_ANSWER_KEY",
            f"PARSE_ANSWER_KEY:{doc_id}:{PIPELINE_VERSION}",
            {"source_document_id": doc_id, "paper_id": paper_id},
            source_document_id=doc_id,
        )
    else:
        job_id = rt.jobs.enqueue(
            "PROCESS_DOCUMENT",
            f"PROCESS_DOCUMENT:{doc_id}:{PIPELINE_VERSION}",
            {
                "source_document_id": doc_id,
                "layout_profile": args.layout,
                "exam_id": rt.repo.resolve_exam_id(args.exam),
                "auto_promote": bool(args.auto_promote),
            },
            source_document_id=doc_id,
        )
    emit({"document_id": doc_id, "job_id": job_id, "created": created})
    return EXIT_OK


def cmd_fetch(args: argparse.Namespace, settings: Settings) -> int:
    """Download manifest-listed PDFs from allow-listed hosts of APPROVED sources, then register them."""
    from pxw.fetch.fetcher import DEFAULT_USER_AGENT, Fetcher, FetchError, Manifest, save_download

    manifest = Manifest.model_validate_json(Path(args.manifest).read_text(encoding="utf-8"))
    rt = _build_runtime(args, settings)
    # Approval gate first: nothing touches the network unless EVERY source in the manifest is approved.
    for code in sorted({e.source for e in manifest.entries}):
        rt.repo.get_source(code)  # SourceNotApproved -> exit 3
        if not manifest.allowed_hosts.get(code):
            raise ConfigError(f"manifest has no allowed_hosts for source {code}")
    if args.dry_run:
        for e in manifest.entries:
            emit({"event": "plan", "source": e.source, "url": e.url, "paper_slug": e.paper_slug, "year": e.year})
        return EXIT_OK
    fetcher = Fetcher(user_agent=args.user_agent or os.environ.get("PXW_USER_AGENT") or DEFAULT_USER_AGENT,
                      min_interval_s=args.min_interval)
    failures = 0
    for e in manifest.entries:
        try:
            res = fetcher.fetch_pdf(e.url, manifest.allowed_hosts[e.source])
        except FetchError as exc:
            failures += 1
            emit({"event": "fetch_failed", "url": e.url, "error": str(exc)})
            continue
        pdf = save_download(res, settings.work_dir / "downloads", e.url)
        emit({"event": "fetched", "url": e.url, "sha256": res.sha256, "bytes": len(res.data)})
        reg = argparse.Namespace(
            job_store=args.job_store, storage=args.storage, source=e.source, file=str(pdf), kind=e.kind,
            paper_slug=e.paper_slug, paper_title=e.paper_title, year=e.year, exam_date=e.exam_date, shift=e.shift,
            session=e.session, paper_code=e.paper_code, layout=e.layout, auto_promote=args.auto_promote, exam=e.exam,
        )
        cmd_register(reg, settings)
    return EXIT_ERROR if failures else EXIT_OK


def cmd_discover(args: argparse.Namespace, settings: Settings) -> int:
    """Crawl allow-listed official index pages for PDF links. Needs no database and downloads nothing."""
    from pxw.fetch.discover import run as discover_run

    only = [s.strip() for s in args.only.split(",") if s.strip()] or None
    summary = discover_run(Path(args.sources), Path(args.catalog),
                           Path(args.manifest_out) if args.manifest_out else None, only=only)
    emit(summary)
    pages = sum(v["pages"] for v in summary["sources"].values())  # type: ignore[union-attr]
    return EXIT_ERROR if pages == 0 else EXIT_OK


def cmd_jobs_run(args: argparse.Namespace, settings: Settings) -> int:
    from pxw.jobs.runner import JobRunner
    from pxw.pipeline.handlers import make_handlers

    rt = _build_runtime(args, settings)
    chain = _ocr_chain(settings, args.ocr_engines)
    handlers = make_handlers(rt.repo, rt.objects, chain, settings.work_dir)
    kinds = [k.strip() for k in args.kinds.split(",") if k.strip()]
    for k in kinds:
        if k not in handlers:
            raise ConfigError(f"no handler for job kind {k!r}")
    worker_id = args.worker_id or f"pxw-{socket.gethostname()}"
    runner = JobRunner(rt.jobs, handlers, worker_id)
    total = dead = 0
    while True:
        summary = runner.run(kinds, max_jobs=max(args.max_jobs - total, 1))  # type: ignore[arg-type]
        for r in summary.results:
            emit({"event": "job", **r})
        total += summary.processed
        dead += summary.dead
        if args.once or total >= args.max_jobs:
            break
        if summary.processed == 0:
            time.sleep(args.poll_seconds)
    emit({"event": "done", "processed": total, "dead": dead})
    return EXIT_JOB_FAILED if dead else EXIT_OK


def cmd_process_document(args: argparse.Namespace, settings: Settings) -> int:
    from pxw.pipeline.process_document import DocumentInput, PipelineContext, run_document, write_bundle

    chain = _ocr_chain(settings, args.ocr_engines, args.ocr_fixtures)  # validate config before touching files
    data = Path(args.file).read_bytes()
    sha = sha256_hex(data)
    doc = DocumentInput(str(uuid.uuid5(_NS, sha)), sha, lambda: data)
    ctx = PipelineContext(
        work_dir=settings.work_dir,
        ocr=chain,
        min_confidence=settings.ocr_min_confidence,
        on_stage=lambda rep: emit({"event": "stage", **rep.to_dict()}),
    )
    res = run_document(doc, ctx, layout=args.layout)
    out = write_bundle(Path(args.out), res)
    emit(
        {
            "event": "done",
            "document_id": doc.document_id,
            "sha256": sha,
            "layout": res["layout"],
            "questions": res["questions"],
            "ocr_pages": res["ocr_pages"],
            "ocr_warnings": res["ocr_warnings"],
            "output": str(out),
        }
    )
    return EXIT_OK


def cmd_parse_answer_key(args: argparse.Namespace, settings: Settings) -> int:
    from pxw.pipeline.parse_answer_key import parse_key_pdf

    rows, unparsed = parse_key_pdf(Path(args.file), args.paper_id, args.document_id)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    atomic_write_json(out / "official_keys.json", [r.model_dump(mode="json") for r in rows])
    emit({"event": "done", "rows": len(rows), "unparsed_rows": unparsed, "output": str(out / "official_keys.json")})
    return EXIT_OK


def cmd_ocr(args: argparse.Namespace, settings: Settings) -> int:
    chain = _ocr_chain(settings, args.engines, args.ocr_fixtures)
    res = chain.recognize(Path(args.image).read_bytes())
    emit({**res.to_dict(), "warnings": chain.last_warnings, "tried": chain.last_tried})
    return EXIT_OK


def cmd_promote(args: argparse.Namespace, settings: Settings) -> int:
    rt = _build_runtime(args, settings)
    exam_id = rt.repo.resolve_exam_id(args.exam)
    doc = rt.repo.get_document(args.document_id)
    rt.repo.get_source(doc.source_code)
    promoted = skipped = 0
    for sq in rt.repo.list_source_questions(args.document_id, "NORMALIZED"):
        if sq.warnings or sq.possible_duplicate_of or sq.duplicate_of_question_id:
            skipped += 1
            continue
        rt.repo.promote(sq.id, exam_id, None)
        promoted += 1
    emit({"event": "done", "promoted": promoted, "skipped": skipped})
    return EXIT_OK


def cmd_dev_synth_pdf(args: argparse.Namespace, settings: Settings) -> int:
    from pxw.devtools.synthetic import make_answer_key_pdf, make_question_pdf

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if args.what == "key":
        rows = [f"{i} {'ABCD'[(i - 1) % 4]}" for i in range(1, args.questions + 1)]
        out.write_bytes(make_answer_key_pdf(rows))
    else:
        doc = make_question_pdf(args.layout, args.questions, image_only_page=args.image_only_page)
        out.write_bytes(doc.pdf)
    emit({"event": "done", "output": str(out), "synthetic": True})
    return EXIT_OK


# --- parser ---------------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="pxw", description="ProjectX ingestion workers")
    p.add_argument("--job-store", choices=["file", "postgres"], default=None)
    p.add_argument("--storage", choices=["local", "r2"], default=None)
    p.add_argument("--work-dir", default=None)
    p.add_argument("--log-level", default=None)
    sub = p.add_subparsers(dest="cmd", required=True)

    ing = sub.add_parser("ingest", help="register documents")
    ing_sub = ing.add_subparsers(dest="ingest_cmd", required=True)
    r = ing_sub.add_parser("register")
    r.add_argument("--source", required=True)
    r.add_argument("--file", required=True)
    r.add_argument("--kind", choices=["QUESTION_PAPER", "ANSWER_KEY"], default="QUESTION_PAPER")
    r.add_argument("--paper-slug", required=True)
    r.add_argument("--paper-title", default=None)
    r.add_argument("--year", type=int, required=True)
    r.add_argument("--exam-date", default=None)
    r.add_argument("--shift", type=int, default=None)
    r.add_argument("--session", default=None)
    r.add_argument("--paper-code", default=None)
    r.add_argument("--layout", default="nta_cbt_v1")
    r.add_argument("--auto-promote", action="store_true")
    r.add_argument("--exam", default="jee-main")
    r.set_defaults(fn=cmd_register)

    f = ing_sub.add_parser("fetch", help="download manifest-listed PDFs from allow-listed hosts of approved sources")
    f.add_argument("--manifest", required=True)
    f.add_argument("--dry-run", action="store_true")
    f.add_argument("--auto-promote", action="store_true")
    f.add_argument("--min-interval", type=float, default=5.0, help="seconds between requests to one host")
    f.add_argument("--user-agent", default=None)
    f.set_defaults(fn=cmd_fetch)

    dv = ing_sub.add_parser("discover", help="index official paper/answer-key PDF links into a catalogue (no downloads)")
    dv.add_argument("--sources", default="workers/scraper/sources.json")
    dv.add_argument("--catalog", default="workers/scraper/catalog.json")
    dv.add_argument("--manifest-out", default=None, help="also write a `pxw ingest fetch` manifest")
    dv.add_argument("--only", default="", help="comma-separated source codes")
    dv.set_defaults(fn=cmd_discover)

    j = sub.add_parser("jobs", help="job runner")
    j_sub = j.add_subparsers(dest="jobs_cmd", required=True)
    jr = j_sub.add_parser("run")
    jr.add_argument("--kinds", default="PROCESS_DOCUMENT,PARSE_ANSWER_KEY")
    jr.add_argument("--max-jobs", type=int, default=10)
    jr.add_argument("--worker-id", default=None)
    jr.add_argument("--once", action="store_true")
    jr.add_argument("--poll-seconds", type=float, default=5.0)
    jr.add_argument("--ocr-engines", default=None)
    jr.set_defaults(fn=cmd_jobs_run)

    pd = sub.add_parser("process-document", help="offline: PDF -> NormalizedQuestion[] bundle")
    pd.add_argument("--file", required=True)
    pd.add_argument("--out", required=True)
    pd.add_argument("--layout", default="auto")
    pd.add_argument("--ocr-engines", default=None)
    pd.add_argument("--ocr-fixtures", default=None, help="JSON {sha256(png): OcrResult} for the mock engine")
    pd.set_defaults(fn=cmd_process_document)

    pk = sub.add_parser("parse-answer-key", help="offline: key PDF -> OfficialKeyIn[]")
    pk.add_argument("--file", required=True)
    pk.add_argument("--out", required=True)
    pk.add_argument("--paper-id", default=_NIL_UUID, help="offline placeholder is the nil UUID")
    pk.add_argument("--document-id", default=_NIL_UUID)
    pk.set_defaults(fn=cmd_parse_answer_key)

    o = sub.add_parser("ocr", help="OCR one image")
    o.add_argument("--image", required=True)
    o.add_argument("--engines", default=None)
    o.add_argument("--ocr-fixtures", default=None)
    o.set_defaults(fn=cmd_ocr)

    pr = sub.add_parser("promote", help="promote clean NORMALIZED source_questions")
    pr.add_argument("--document-id", required=True)
    pr.add_argument("--exam", required=True)
    pr.set_defaults(fn=cmd_promote)

    dev = sub.add_parser("dev", help="developer helpers")
    dev_sub = dev.add_subparsers(dest="dev_cmd", required=True)
    sp = dev_sub.add_parser("synth-pdf", help="generate a SYNTHETIC fixture PDF")
    sp.add_argument("--out", required=True)
    sp.add_argument("--what", choices=["questions", "key"], default="questions")
    sp.add_argument("--layout", choices=["nta_cbt_v1", "generic_numbered"], default="nta_cbt_v1")
    sp.add_argument("--questions", type=int, default=6)
    sp.add_argument("--image-only-page", type=int, default=None)
    sp.set_defaults(fn=cmd_dev_synth_pdf)

    from pxw.content.commands import add_content_parser

    add_content_parser(sub)
    return p


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except (AttributeError, ValueError):
            pass
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else EXIT_USAGE
    try:
        settings = Settings.from_env()
        if args.work_dir:
            settings.work_dir = Path(args.work_dir)
        configure_logging(args.log_level or settings.log_level)
        return int(args.fn(args, settings))
    except SourceNotApproved as exc:
        emit({"event": "error", "code": "SOURCE_NOT_APPROVED", "message": str(exc)})
        return EXIT_NOT_APPROVED
    except ConfigError as exc:
        emit({"event": "error", "code": "CONFIG", "message": str(exc)})
        return EXIT_USAGE
    except PermanentError as exc:
        emit({"event": "error", "code": type(exc).__name__, "message": str(exc)})
        return EXIT_JOB_FAILED
    except Exception as exc:  # noqa: BLE001 - top-level CLI guard: report any failure as exit code 1
        if os.environ.get("PXW_DEBUG"):
            traceback.print_exc()
        emit({"event": "error", "code": type(exc).__name__, "message": str(exc)})
        return EXIT_ERROR


if __name__ == "__main__":
    raise SystemExit(main())
