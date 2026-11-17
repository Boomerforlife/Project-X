"""NTA final answer key parsing. The PDF is SYNTHETIC, laid out like NTA's: date/shift header, three ID column pairs."""

from __future__ import annotations

from pathlib import Path

import pymupdf

from pxw.answer_keys.nta_final import normalize_answer, paper_slug, parse_nta_final_key


def _key_pdf(path: Path, footer: bool = False) -> None:
    doc = pymupdf.open()
    p = doc.new_page(width=595, height=842)
    p.insert_text((40, 40), "NATIONAL TESTING AGENCY", fontsize=9)
    p.insert_text((40, 55), "Exam Date : 02.04.2026", fontsize=9)
    p.insert_text((40, 70), "Exam Shift : Second", fontsize=9)
    p.insert_text((40, 85), "( MATHEMATICS )", fontsize=9)
    for x in (40.0, 220.0, 400.0):
        p.insert_text((x, 98), "QUESTION ID", fontsize=7)
        p.insert_text((x + 75, 98), "CORRECT OPTION ID", fontsize=7)
    rows = [
        [("900000001", "900000102"), ("900000002", "900000106"), ("900000003", "Dropped")],
        [("900000004", "12"), ("900000005", "900000117,900000118"), ("900000006", "7")],
        [("900000007", "Any non -negative Integer"), ("900000008", "41 or 42"), ("900000009", "5")],
    ]
    y = 110.0
    for row in rows:
        x = 40.0
        for qid, ans in row:
            p.insert_text((x, y), qid, fontsize=8)
            p.insert_text((x + 75, y), ans, fontsize=8)
            x += 180
        y += 16
    if footer:  # the 2021 keys print the word QUESTION again at the foot of the page
        p.insert_text((90, 820), "FINAL ANSWER KEY QUESTION PAPER", fontsize=7)
    doc.save(str(path))
    doc.close()


def test_parses_pairs_by_position_with_date_and_shift(tmp_path: Path) -> None:
    pdf = tmp_path / "key.pdf"
    _key_pdf(pdf)
    rows = parse_nta_final_key(pdf)
    got = {r.external_question_id: r.raw_answer for r in rows}
    assert got["900000001"] == "900000102"
    assert got["900000002"] == "900000106"
    assert got["900000003"] == "Dropped"
    assert got["900000004"] == "12"
    assert got["900000006"] == "7"
    # Words in an answer cell must not shift the pairs after it (this once mis-assigned an answer).
    assert got["900000007"] == "Any non -negative Integer"
    assert got["900000008"] == "41 or 42"
    assert got["900000009"] == "5"
    assert all(r.exam_date == "2026-04-02" and r.shift == 2 for r in rows)
    assert paper_slug("jee-main", "2026-04-02", 2) == "jee-main-2026-04-02-shift-2"


def test_normalize_answer_rules() -> None:
    opts = {"900000101", "900000102", "900000103", "900000104"}
    assert normalize_answer("900000102", opts) == {"kind": "EXTERNAL_OPTION_IDS", "ids": ["900000102"]}
    assert normalize_answer("900000101,900000104", opts)["ids"] == ["900000101", "900000104"]
    assert normalize_answer("12", None) == {"kind": "NUMERIC", "accepted_ranges": [{"min": "12", "max": "12"}]}
    assert normalize_answer("Dropped", opts) == {"kind": "DROPPED"}
    assert normalize_answer("41 or 42", None)["accepted_ranges"] == [{"min": "41", "max": "41"}, {"min": "42", "max": "42"}]
    assert normalize_answer("Any non -negative Integer", None) == {"kind": "DROPPED"}  # any answer accepted -> review
    # An id that is not one of this question's options is never accepted as an answer.
    assert normalize_answer("999999999", opts) == {"kind": "DROPPED"}


def test_footer_words_do_not_break_the_columns(tmp_path: Path) -> None:
    pdf = tmp_path / "key21.pdf"
    _key_pdf(pdf, footer=True)
    got = {r.external_question_id: r.raw_answer for r in parse_nta_final_key(pdf)}
    assert len(got) == 9 and got["900000002"] == "900000106" and got["900000009"] == "5"
