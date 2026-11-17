"""NEET booklet reader on a SYNTHETIC two-column booklet (no real papers in the repo)."""

from __future__ import annotations

from pathlib import Path

import pymupdf

from pxw.extraction.neet_booklet import extract_neet_booklet

STEM = "A particle is released from height S above the surface of the Earth. Find the speed at that instant :"


def _booklet(path: Path, hindi: bool = False) -> None:
    doc = pymupdf.open()
    cover = doc.new_page(width=595, height=842)
    for i, t in enumerate(["This Booklet contains 4 pages.", "Important Instructions :", "1. The Answer Sheet is inside."]):
        cover.insert_text((46, 120 + 20 * i), t, fontsize=9)  # numbered instructions must not become questions
    n = 1
    for pg in range(2):
        page = doc.new_page(width=595, height=842)
        page.draw_line((298, 91), (298, 775))  # column rule
        page.insert_text((42, 80), "N2", fontsize=9)
        y_start = 125
        if pg == 0:
            page.insert_text((107, 100), "Section - A (Physics)", fontsize=10)
        for col_x in (42, 305):
            y = y_start
            for _ in range(2):
                if pg == 1 and col_x == 305 and n == 7:
                    page.insert_text((col_x + 40, y), "Section - A (Biology : Botany)", fontsize=10)
                    y += 25
                page.insert_text((col_x, y), f"{n}.", fontsize=10)
                page.insert_text((col_x + 29, y), ("मान " if hindi else "") + STEM[:40], fontsize=9)
                page.insert_text((col_x + 29, y + 12), STEM[40:], fontsize=9)
                for k in range(4):
                    page.insert_text((col_x + 29, y + 30 + 14 * k), f"({k + 1})   {k + 2} units (in 10 cases)", fontsize=9)
                y += 130
                n += 1
    doc.save(str(path))


def test_two_columns_sequence_subjects_and_options(tmp_path: Path) -> None:
    pdf = tmp_path / "neet.pdf"
    _booklet(pdf)
    r = extract_neet_booklet(pdf, "00000000-0000-4000-8000-0000000000f2", tmp_path / "crops", expected_questions=(8,))
    qs = r["questions"]
    assert [q["question_number"] for q in qs] == [str(i) for i in range(1, 9)]  # cover's "1." is not a question
    assert [q["section_hint"] for q in qs] == ["PHYSICS"] * 6 + ["BOTANY"] * 2
    assert all([o["label"] for o in q["options"]] == ["1", "2", "3", "4"] for q in qs)
    assert all(q["extraction"]["warnings"] == [] for q in qs)
    assert all(len(q["assets"]) == 1 for q in qs)
    assert r["stats"]["complete"] is True


def test_hindi_or_bilingual_booklets_are_not_read(tmp_path: Path, monkeypatch) -> None:
    from pxw.extraction import neet_booklet as nb

    assert nb._devanagari_share("The value of x is") == 0.0
    assert nb._devanagari_share("मान x का") > 0.5
    pdf = tmp_path / "neet.pdf"
    _booklet(pdf)
    real_parse = nb.parse
    monkeypatch.setattr(nb, "parse", lambda doc: (real_parse(doc)[0], {"devanagari_share": 0.4, "pages": 3}))
    r = nb.extract_neet_booklet(pdf, "00000000-0000-4000-8000-0000000000f3", tmp_path / "crops", expected_questions=(8,))
    assert r["questions"] == [] and r["stats"]["skipped"] == "not an English-medium booklet"
