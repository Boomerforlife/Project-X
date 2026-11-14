"""Stage artifacts/resume, OCR pages, idempotent persist, approval enforcement."""

from __future__ import annotations

import json

import pytest
from conftest import make_ctx, make_doc_input, mock_fixture_for_page

from pxw.common.errors import ChecksumMismatch, SourceNotApproved, StopAfterStage, UnsupportedLayout
from pxw.common.models import SourceDocumentIn
from pxw.db.file_repo import FileIngestionRepo, exam_uuid
from pxw.devtools.synthetic import make_question_pdf
from pxw.jobs.file_store import FileJobStore
from pxw.jobs.runner import JobRunner
from pxw.ocr.chain import OcrChain
from pxw.ocr.mock import MockOcrEngine
from pxw.pipeline.handlers import make_handlers
from pxw.pipeline.process_document import DocumentInput, run_document
from pxw.storage.local import LocalObjectStore


def test_stage_artifacts_written_and_resume_skips_1_to_4(synth_nta, tmp_path):
    doc = make_doc_input(synth_nta.pdf)
    seen: list = []
    ctx = make_ctx(tmp_path, stop_after="segment", on_stage=seen.append)
    with pytest.raises(StopAfterStage):  # "kill after stage 4"
        run_document(doc, ctx)
    assert [(r.stage, r.skipped) for r in seen] == [(s, False) for s in ("fetch", "extract", "ocr", "segment")]
    d = tmp_path / doc.sha256
    for stage in ("fetch", "extract", "ocr", "segment"):
        art = json.loads((d / f"{stage}.v1.json").read_text(encoding="utf-8"))
        assert art["stage"] == stage and len(art["payload_sha256"]) == 64
    assert not (d / "figures.v1.json").exists()
    assert not list(d.glob("*.tmp"))

    seen2: list = []
    res = run_document(doc, make_ctx(tmp_path, on_stage=seen2.append))
    skipped = {r.stage: r.skipped for r in seen2}
    assert skipped == {"fetch": True, "extract": True, "ocr": True, "segment": True,
                       "figures": False, "normalize": False, "dedupe": False}
    assert res["questions"] == 7

    seen3: list = []
    run_document(doc, make_ctx(tmp_path, on_stage=seen3.append))
    assert all(r.skipped for r in seen3 if r.stage != "dedupe")


def test_resume_does_not_call_fetch_or_ocr_again(synth_nta, tmp_path):
    pdf = synth_nta.pdf
    calls = {"n": 0}

    def get_bytes():
        calls["n"] += 1
        return pdf

    doc = DocumentInput("doc-1", make_doc_input(pdf).sha256, get_bytes)
    run_document(doc, make_ctx(tmp_path))
    run_document(doc, make_ctx(tmp_path))
    assert calls["n"] == 1


def test_corrupt_artifact_is_recomputed(synth_nta, tmp_path):
    doc = make_doc_input(synth_nta.pdf)
    run_document(doc, make_ctx(tmp_path))
    p = tmp_path / doc.sha256 / "segment.v1.json"
    art = json.loads(p.read_text(encoding="utf-8"))
    art["payload"]["questions"] = []
    p.write_text(json.dumps(art), encoding="utf-8")  # payload no longer matches its sha256
    seen: list = []
    res = run_document(doc, make_ctx(tmp_path, on_stage=seen.append))
    assert res["questions"] == 7
    assert {r.stage: r.skipped for r in seen}["segment"] is False


def test_checksum_mismatch_is_permanent(synth_nta, tmp_path):
    doc = DocumentInput("d", "0" * 64, lambda: synth_nta.pdf)
    with pytest.raises(ChecksumMismatch):
        run_document(doc, make_ctx(tmp_path))


def test_unknown_layout_is_permanent(synth_nta, tmp_path):
    with pytest.raises(UnsupportedLayout):
        run_document(make_doc_input(synth_nta.pdf), make_ctx(tmp_path), layout="no_such_layout")


def test_image_only_page_goes_through_ocr_chain(tmp_path):
    synth = make_question_pdf("nta_cbt_v1", 7, image_only_page=2)
    assert 2 in synth.ocr_pages
    mock = mock_fixture_for_page(synth, 2, synth.pdf, tmp_path)
    chain = OcrChain([mock], 0.6)
    res = run_document(make_doc_input(synth.pdf), make_ctx(tmp_path / "w", ocr=chain))
    qs = res["_questions"]
    assert res["ocr_pages"] == 1 and res["ocr_warnings"] == [] and len(mock.calls) == 1
    assert [q["question_number"] for q in qs] == [str(i) for i in range(1, 8)]
    methods = [q["extraction"]["method"] for q in qs]
    assert methods[0] == "TEXT" and methods[-1] == "OCR"
    last = qs[-1]
    assert last["extraction"]["ocr_engine"] == "mock" and last["extraction"]["mean_confidence"] == 0.95
    assert last["external_question_id"] == "4054550070"
    assert all(q["extraction"]["warnings"] == [] for q in qs)


def test_image_only_page_without_ocr_engine_warns(tmp_path):
    synth = make_question_pdf("nta_cbt_v1", 7, image_only_page=2)
    chain = OcrChain([], 0.6)  # no engines at all
    res = run_document(make_doc_input(synth.pdf), make_ctx(tmp_path, ocr=chain))
    assert res["ocr_warnings"] == ["OCR_UNAVAILABLE"]
    assert res["questions"] < 7  # the OCR-only questions are lost, loudly reported
    spanning = [q for q in res["_questions"] if q["page_end"] > q["page_start"]]
    assert all("OCR_UNAVAILABLE" in q["extraction"]["warnings"] for q in spanning)


def test_low_confidence_ocr_warns_and_blocks(tmp_path):
    synth = make_question_pdf("nta_cbt_v1", 7, image_only_page=2)
    mock = mock_fixture_for_page(synth, 2, synth.pdf, tmp_path, conf=0.4)
    res = run_document(make_doc_input(synth.pdf), make_ctx(tmp_path / "w", ocr=OcrChain([mock], 0.6)))
    assert res["ocr_warnings"] == ["OCR_LOW_CONFIDENCE"]
    assert "OCR_LOW_CONFIDENCE" in res["_questions"][-1]["extraction"]["warnings"]


def _register(repo, pdf, key="k", source="PROJECTX_EDITORIAL"):
    return repo.register_document(
        SourceDocumentIn(source_code=source, r2_key=key, original_filename="x.pdf", bytes=len(pdf),
                         sha256=make_doc_input(pdf).sha256)
    )[0]


def test_persist_is_idempotent_and_uploads_crops(synth_nta, tmp_path):
    repo = FileIngestionRepo(tmp_path / "db")
    objects = LocalObjectStore(tmp_path / "storage")
    did = _register(repo, synth_nta.pdf)
    ctx = make_ctx(tmp_path / "w", repo=repo, objects=objects)
    r1 = run_document(make_doc_input(synth_nta.pdf, did), ctx, layout="nta_cbt_v1")
    c1 = repo.counts()
    r2 = run_document(make_doc_input(synth_nta.pdf, did), ctx, layout="nta_cbt_v1")
    assert repo.counts() == c1
    assert c1["source_questions"] == 7 and c1["assets"] == 1 and c1["questions"] == 0
    assert r1["persisted"] == r2["persisted"] == {"NORMALIZED": 7}
    key = f"derived/{did}/crops/q3-1.png"
    assert objects.exists("SOURCE_DOCS", key) and objects.content_type("SOURCE_DOCS", key) == "image/png"
    sqs = repo.list_source_questions(did)
    assert len(sqs) == 7
    # asset_id was written back into the stored NormalizedQuestion
    import json as _json

    st = _json.loads((tmp_path / "db" / "state.json").read_text(encoding="utf-8"))
    q3 = next(r for r in st["source_questions"].values() if r["question_number"] == "3")
    assert q3["normalized"]["assets"][0]["asset_id"] in st["assets"]


def test_auto_promote_only_clean_questions(tmp_path):
    synth = make_question_pdf("nta_cbt_v1", 7, unicode_math=True)
    repo = FileIngestionRepo(tmp_path / "db")
    did = _register(repo, synth.pdf)
    ctx = make_ctx(tmp_path / "w", repo=repo)
    res = run_document(make_doc_input(synth.pdf, did), ctx, exam_id=exam_uuid("jee-main"), auto_promote=True)
    assert res["promoted"] == 7
    again = run_document(make_doc_input(synth.pdf, did), ctx, exam_id=exam_uuid("jee-main"), auto_promote=True)
    assert repo.counts()["questions"] == 7 and again["promoted"] == 7  # idempotent: same question ids
    assert {s.status for s in repo.list_source_questions(did)} == {"PROMOTED"}
    # without auto_promote nothing is promoted
    repo2 = FileIngestionRepo(tmp_path / "db2")
    did2 = _register(repo2, synth.pdf)
    r = run_document(make_doc_input(synth.pdf, did2), make_ctx(tmp_path / "w2", repo=repo2), exam_id="e")
    assert r["promoted"] == 0 and repo2.counts()["questions"] == 0


def test_flagged_questions_are_not_auto_promoted(tmp_path):
    synth = make_question_pdf("nta_cbt_v1", 7, image_only_page=2)
    chain = OcrChain([MockOcrEngine()], 0.6)  # empty OCR -> questions on page 2 are lost; page-1 ones are clean
    repo = FileIngestionRepo(tmp_path / "db")
    did = _register(repo, synth.pdf)
    res = run_document(make_doc_input(synth.pdf, did), make_ctx(tmp_path / "w", ocr=chain, repo=repo),
                       exam_id="exam", auto_promote=True)
    flagged = [q for q in res["_questions"] if q["extraction"]["warnings"]]
    assert res["promoted"] == res["questions"] - len(flagged)


def test_source_not_approved_is_refused_permanently(synth_nta, tmp_path):
    repo = FileIngestionRepo(tmp_path / "db")
    objects = LocalObjectStore(tmp_path / "storage")
    with pytest.raises(SourceNotApproved):
        repo.get_source("NTA")
    with pytest.raises(SourceNotApproved):
        repo.get_source("UNKNOWN")
    assert repo.get_source("PROJECTX_EDITORIAL").code == "PROJECTX_EDITORIAL"
    # a document registered under an unapproved source must fail the job without retries
    key = "sources/NTA/2024/x.pdf"
    objects.put("SOURCE_DOCS", key, synth_nta.pdf, "application/pdf")
    did = repo.register_document(
        SourceDocumentIn(source_code="NTA", r2_key=key, original_filename="x.pdf", bytes=len(synth_nta.pdf),
                         sha256=make_doc_input(synth_nta.pdf).sha256)
    )[0]
    jobs = FileJobStore(tmp_path / "jobs.json")
    jid = jobs.enqueue("PROCESS_DOCUMENT", "PROCESS_DOCUMENT:x:v1", {"source_document_id": did}, source_document_id=did)
    handlers = make_handlers(repo, objects, OcrChain([MockOcrEngine()], 0.6), tmp_path / "w")
    summary = JobRunner(jobs, handlers, "w").run(max_jobs=3)
    assert summary.dead == 1
    rec = jobs.get(jid)
    assert rec["status"] == "DEAD" and rec["attempts"] == 1 and "SourceNotApproved" in rec["last_error"]
    assert repo.counts()["source_questions"] == 0
    # approving the source later lets a fresh job succeed
    repo.set_source("NTA", reuse_permitted=True, approved_at="2026-02-01T00:00:00+00:00")
    jid2 = jobs.enqueue("PROCESS_DOCUMENT", "PROCESS_DOCUMENT:x:v2", {"source_document_id": did}, source_document_id=did)
    assert JobRunner(jobs, handlers, "w").run(max_jobs=3).succeeded == 1
    assert jobs.get(jid2)["status"] == "SUCCEEDED" and repo.counts()["source_questions"] == 7


def test_parse_answer_key_job_via_runner(tmp_path):
    from pxw.devtools.synthetic import make_answer_key_pdf

    pdf = make_answer_key_pdf(["1 A", "2 B", "3 2.4 to 2.6", "4 Drop", "5 ???"])
    repo = FileIngestionRepo(tmp_path / "db")
    objects = LocalObjectStore(tmp_path / "storage")
    from pxw.common.models import PaperIn

    paper_id = repo.upsert_paper(PaperIn(slug="synthetic-paper-1", title="Synthetic", year=2024))
    assert repo.upsert_paper(PaperIn(slug="synthetic-paper-1", title="Synthetic", year=2024)) == paper_id
    key = "sources/PROJECTX_EDITORIAL/2024/key.pdf"
    objects.put("SOURCE_DOCS", key, pdf, "application/pdf")
    did = repo.register_document(
        SourceDocumentIn(source_code="PROJECTX_EDITORIAL", paper_id=paper_id, kind="ANSWER_KEY", r2_key=key,
                         original_filename="key.pdf", bytes=len(pdf), sha256=make_doc_input(pdf).sha256)
    )[0]
    jobs = FileJobStore(tmp_path / "jobs.json")
    jid = jobs.enqueue("PARSE_ANSWER_KEY", "PARSE_ANSWER_KEY:k:v1", {"source_document_id": did, "paper_id": paper_id})
    handlers = make_handlers(repo, objects, OcrChain([], 0.6), tmp_path / "w")
    for _ in range(2):  # twice: upsert is idempotent
        JobRunner(jobs, handlers, "w").run(max_jobs=1)
        jobs.enqueue("PARSE_ANSWER_KEY", f"PARSE_ANSWER_KEY:k:v1:{_}", {"source_document_id": did, "paper_id": paper_id})
    rec = jobs.get(jid)
    assert rec["status"] == "SUCCEEDED"
    assert rec["result"]["rows"] == 4 and rec["result"]["unparsed_rows"] == ["5 ???"]
    assert repo.counts()["keys"] == 4
    assert any(e["level"] == "WARN" for e in jobs.events(jid))
