"""NTA computer-based-test layout (content as images). The PDF here is SYNTHETIC, built to mimic NTA's real format:
metadata in the text layer, the stem and each option as embedded images."""

from __future__ import annotations

import io
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

from pxw.extraction.nta_cbt_image import extract_nta_cbt_image, looks_like


def _png(text: str, w: int = 420, h: int = 60) -> bytes:
    im = Image.new("RGB", (w, h), "white")
    ImageDraw.Draw(im).text((8, 18), text, fill="black")
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _synthetic_nta_pdf(path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    y = 40.0

    def text(t: str, color: tuple[float, float, float] = (0, 0, 0)) -> None:
        nonlocal y
        page.insert_text((40, y), t, fontsize=8, color=color)
        y += 13

    text("Mathematics Section A")
    y += 6
    text(
        "Question Number : 1 Question Id : 900000001 Question Type : MCQ Option Shuffling : Yes Display Question Number :"
    )
    text("Yes Is Question Mandatory : No Single Line Question Option : No Option Orientation : Vertical")
    page.insert_image(pymupdf.Rect(42, y, 330, y + 40), stream=_png("SYNTHETIC stem: what is 2 + 2?"))
    y += 50
    text("Options :")
    for i, ans in enumerate(["3", "4", "5", "6"]):
        page.insert_text((40, y + 12), f"90000010{i}.", fontsize=8)
        page.insert_image(pymupdf.Rect(95, y, 160, y + 18), stream=_png(ans, 80, 30))
        y += 26
    y += 10
    text("Mathematics Section B")
    y += 6
    text(
        "Question Number : 2 Question Id : 900000002 Question Type : SA Display Question Number : Yes Keyboard Layout :"
    )
    text("Inscript")
    page.insert_image(pymupdf.Rect(42, y, 330, y + 40), stream=_png("SYNTHETIC stem: the value of 3 x 3 is ____"))
    y += 50
    for t in [
        "Response Type : Numeric",
        "Evaluation Required For SA : Yes",
        "Answers Type : Equal",
        "Possible Answers :",
    ]:
        text(t)
    text("1", color=(0, 0.5, 0))  # NTA's placeholder, not the answer
    doc.save(str(path))
    doc.close()


def test_extracts_questions_options_and_ids(tmp_path: Path) -> None:
    pdf = tmp_path / "nta.pdf"
    _synthetic_nta_pdf(pdf)
    assert looks_like(pdf)
    r = extract_nta_cbt_image(pdf, "00000000-0000-4000-8000-0000000000aa", tmp_path / "crops")
    qs = {q["question_number"]: q for q in r["questions"]}
    assert r["stats"]["questions"] == 2 and r["stats"]["mcq"] == 1 and r["stats"]["numerical"] == 1

    q1 = qs["1"]
    assert q1["external_question_id"] == "900000001"
    assert q1["section_hint"] == "MATHEMATICS"
    assert q1["question_type_guess"] == "SINGLE_MCQ"
    assert [o["label"] for o in q1["options"]] == ["A", "B", "C", "D"]
    assert [o["external_option_id"] for o in q1["options"]] == [f"90000010{i}" for i in range(4)]
    assert all(o["content"] and o["content"][0]["type"] == "image" for o in q1["options"])
    assert q1["content"][0]["type"] == "image"
    assert q1["extraction"]["warnings"] == []

    q2 = qs["2"]
    assert q2["question_type_guess"] == "NUMERICAL"
    assert q2["options"] == []
    # Only the stem image: the "Inscript" header line and the green "1" placeholder are not content.
    assert [a["asset_ref"] for a in q2["assets"]] == ["q2-stem1"]
    for a in q1["assets"] + q2["assets"]:
        assert (tmp_path / "crops" / a["r2_key"].rsplit("/", 1)[-1]).is_file()


def test_ocr_text_becomes_question_text_and_alt(tmp_path: Path) -> None:
    pdf = tmp_path / "nta.pdf"
    _synthetic_nta_pdf(pdf)
    calls: list[int] = []

    def fake_ocr(png: bytes) -> tuple[str, float | None, str | None]:
        calls.append(len(png))
        return "what is two plus two", 0.97, "fake"

    r = extract_nta_cbt_image(pdf, "00000000-0000-4000-8000-0000000000ab", tmp_path / "crops", ocr=fake_ocr)
    q1 = r["questions"][0]
    assert q1["question_text"] == "what is two plus two"
    assert q1["content"][0]["alt"] == "what is two plus two"
    assert q1["extraction"]["ocr_engine"] == "fake"
    assert len(calls) == 2  # stems only (one per question); options are not OCR'd


def test_non_nta_pdf_is_not_detected(tmp_path: Path) -> None:
    doc = pymupdf.open()
    doc.new_page().insert_text((40, 60), "1. A plain numbered question about motion")
    doc.save(str(tmp_path / "plain.pdf"))
    assert not looks_like(tmp_path / "plain.pdf")


def test_without_ocr_different_questions_never_share_searchable_text(tmp_path: Path) -> None:
    """Regression: a generic 'Question N (image)' text made dedupe flag every question as a duplicate."""
    pdf = tmp_path / "nta.pdf"
    _synthetic_nta_pdf(pdf)
    r = extract_nta_cbt_image(pdf, "00000000-0000-4000-8000-0000000000ac", tmp_path / "crops", ocr=None)
    texts = [q["normalized_text"] for q in r["questions"]]
    assert len(set(texts)) == len(texts)
    assert all("image " in t for t in texts)
    assert len({q["question_text"] for q in r["questions"]}) == len(texts)
