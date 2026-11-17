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


def _mirrored_bilingual_pdf(path: Path, pages: int = 6) -> None:
    """NTA paper as a mirror republishes it: each question twice (Hindi block first, then English, same Question Id),
    the mirror's logo image at the same spot on every page and its name in the text layer."""
    doc = pymupdf.open()
    logo = _png("MIRROR LOGO", 200, 200)
    for n in range(1, pages + 1):
        page = doc.new_page(width=595, height=842)
        page.insert_text((14, 24), "www.prepp.in", fontsize=12)
        page.insert_image(pymupdf.Rect(200, 330, 380, 510), stream=logo)
        y = 60.0
        if n == 1:
            page.insert_text((40, y), "Physics Section A", fontsize=8)
            y += 20
        for lang, w in (("HI", 200), ("EN", 330)):
            page.insert_text((40, y), f"Question Number : {n} Question Id : 70000000{n} Question Type : MCQ Option Shuffling : Yes",
                             fontsize=8)
            y += 22  # mirrors re-render the metadata with wider line spacing
            page.insert_text((40, y), "Instruction Time : 0", fontsize=8)
            y += 22
            page.insert_text((40, y), "Correct Marks : 4 Wrong Marks : 1", fontsize=8)
            y += 14
            page.insert_image(pymupdf.Rect(42, y, 42 + w, y + 30), stream=_png(f"{lang} stem {n}", w * 2, 60))
            y += 38
            page.insert_text((40, y), "Options :", fontsize=8)
            y += 4
            for i in range(4):
                page.insert_text((40, y + 12), f"70000{n}{lang == 'EN':d}{i}0.", fontsize=8)
                page.insert_image(pymupdf.Rect(95, y, 160, y + 16), stream=_png(f"{lang}{i}", 80, 30))
                y += 20
            y += 8
    doc.save(str(path))
    doc.close()


def _fake_ocr(png: bytes) -> tuple[str, float, str]:
    # Wide crops are the English stems in the synthetic paper; the narrow ones stand for Devanagari.
    width = int.from_bytes(png[16:20], "big")
    return ("Let the value of x be found" if width > 700 else "मान x का", 0.9, "fake")


def test_mirror_marks_are_stripped_and_english_kept(tmp_path: Path) -> None:
    pdf = tmp_path / "mirror.pdf"
    _mirrored_bilingual_pdf(pdf)
    r = extract_nta_cbt_image(pdf, "00000000-0000-4000-8000-0000000000ab", tmp_path / "crops", ocr=_fake_ocr,
                              strip_marks=True)
    assert r["stats"]["mark_images"] == 6 and r["stats"]["mark_texts"] == 6
    assert r["stats"]["other_language_blocks_dropped"] == 6
    qs = r["questions"]
    assert [q["external_question_id"] for q in qs] == [f"70000000{n}" for n in range(1, 7)]
    for q in qs:
        assert q["question_text"].startswith("Let the value"), q["question_text"]  # the English version
        assert "Instruction Time" not in q["question_text"]  # metadata is header, not stem
        assert q["extraction"]["warnings"] == []
        assert [o["external_option_id"][-3] for o in q["options"]] == ["1"] * 4  # English block's options
        assert q["section_hint"] == "PHYSICS"


def test_bilingual_without_ocr_keeps_first_and_flags(tmp_path: Path) -> None:
    pdf = tmp_path / "mirror.pdf"
    _mirrored_bilingual_pdf(pdf, pages=2)
    r = extract_nta_cbt_image(pdf, "00000000-0000-4000-8000-0000000000ac", tmp_path / "crops", strip_marks=True)
    assert all("LANGUAGE_NOT_CONFIRMED" in q["extraction"]["warnings"] for q in r["questions"])
