"""Shared fixtures. All PDFs are SYNTHETIC and generated here; no real exam content exists in this repo."""

from __future__ import annotations

import hashlib
import warnings
from pathlib import Path

import pytest

warnings.filterwarnings("ignore", category=FutureWarning)

from pxw.devtools.synthetic import SyntheticDoc, make_question_pdf
from pxw.extraction.pdf import open_pdf, render_page_png
from pxw.ocr.base import OcrLine, OcrResult
from pxw.ocr.chain import OcrChain
from pxw.ocr.mock import MockOcrEngine
from pxw.pipeline.process_document import DocumentInput, PipelineContext


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


@pytest.fixture
def synth_nta() -> SyntheticDoc:
    return make_question_pdf("nta_cbt_v1", 7)


@pytest.fixture
def synth_generic() -> SyntheticDoc:
    return make_question_pdf("generic_numbered", 7)


def make_doc_input(pdf: bytes, document_id: str = "doc-1") -> DocumentInput:
    return DocumentInput(document_id=document_id, sha256=sha(pdf), get_bytes=lambda: pdf)


def make_ctx(work_dir: Path, ocr: OcrChain | None = None, **kw) -> PipelineContext:
    return PipelineContext(
        work_dir=work_dir, ocr=ocr or OcrChain([MockOcrEngine()], 0.6), min_confidence=0.6, **kw
    )


def mock_fixture_for_page(synth: SyntheticDoc, page_no: int, pdf: bytes, tmp_path: Path, conf: float = 0.95) -> MockOcrEngine:
    """MockOcrEngine that 'recognises' the image-only page using the generator's ground truth."""
    p = tmp_path / "ocr_src.pdf"
    p.write_bytes(pdf)
    doc = open_pdf(p)
    try:
        png = render_page_png(doc, page_no - 1, 200)
    finally:
        doc.close()
    scale = 200 / 72
    lines = [
        OcrLine(text, (b[0] * scale, b[1] * scale, b[2] * scale, b[3] * scale), conf)
        for text, b in synth.ocr_pages[page_no]
    ]
    res = OcrResult("mock", lines, conf)
    return MockOcrEngine({sha(png): res})
