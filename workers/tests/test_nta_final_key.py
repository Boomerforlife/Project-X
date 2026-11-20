"""NTA final answer key parsing. The PDF is SYNTHETIC, laid out like NTA's: date/shift header, three ID column pairs."""

from __future__ import annotations

from pathlib import Path

import pymupdf

from pxw.answer_keys.nta_final import normalize_answer, paper_slug, parse_nta_final_key


def _key_pdf(path: Path, footer: bool = False, answer_dx: float = 75.0, date: str = "02.04.2026") -> None:
    doc = pymupdf.open()
    p = doc.new_page(width=595, height=842)
    p.insert_text((40, 40), "NATIONAL TESTING AGENCY", fontsize=9)
    p.insert_text((40, 55), f"Exam Date : {date}", fontsize=9)
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
            p.insert_text((x + answer_dx, y), ans, fontsize=8)
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


def test_2024_layout_answer_column_left_of_its_header_and_dashed_date(tmp_path: Path) -> None:
    pdf = tmp_path / "key24.pdf"
    _key_pdf(pdf, answer_dx=60.0, date="02-04-2026")  # answers start 15pt left of "CORRECT OPTION ID"
    rows = parse_nta_final_key(pdf)
    got = {r.external_question_id: r.raw_answer for r in rows}
    assert len(got) == 9 and got["900000001"] == "900000102" and got["900000005"] == "900000117,900000118"
    assert all(r.exam_date == "2026-04-02" for r in rows)


def _key_pdf_2025(path: Path) -> None:
    """2019/2025 style: "Shift : First", ids starting ~17pt left of their "QUESTION ID" header, a wrapped range."""
    doc = pymupdf.open()
    p = doc.new_page(width=595, height=842)
    p.insert_text((40, 40), "NATIONAL TESTING AGENCY", fontsize=9)
    p.insert_text((40, 55), "Exam Date : 02.04.2025", fontsize=9)
    p.insert_text((40, 70), "Shift : First", fontsize=9)
    for x in (31.0, 219.0, 414.0):
        p.insert_text((x, 98), "QUESTION ID", fontsize=7)
        p.insert_text((x + 72, 98), "CORRECT OPTION ID", fontsize=7)
    rows = [
        [("603421901", "6034213061"), ("603421926", "6034213147"), ("603421951", "6034213234")],
        [("603421902", "6034213067"), ("603421927", "189000.00 to"), ("603421952", "6034213236")],
    ]
    y = 120.0
    for row in rows:
        for (qid, ans), (qx, ax) in zip(row, ((30.0, 117.0), (214.0, 301.0), (397.0, 484.0)), strict=True):
            p.insert_text((qx, y), qid, fontsize=8)
            p.insert_text((ax, y), ans, fontsize=8)
        y += 21
    p.insert_text((301.0, 134.0 + 21), "190000.00", fontsize=8)  # the range's second line, below its own cell
    doc.save(str(path))
    doc.close()


def test_2025_layout_short_shift_label_ids_left_of_header_and_wrapped_range(tmp_path: Path) -> None:
    pdf = tmp_path / "key25.pdf"
    _key_pdf_2025(pdf)
    rows = parse_nta_final_key(pdf)
    got = {r.external_question_id: r.raw_answer for r in rows}
    assert len(got) == 6  # the third column is read, not glued onto the second column's answers
    assert got["603421926"] == "6034213147" and got["603421951"] == "6034213234"
    assert got["603421927"] == "189000.00 to 190000.00"
    assert all(r.exam_date == "2025-04-02" and r.shift == 1 for r in rows)


def test_normalize_answer_numeric_range() -> None:
    assert normalize_answer("189000.00 to 190000.00", None) == {"kind": "NUMERIC", "accepted_ranges": [{"min": "189000.00", "max": "190000.00"}]}
    assert normalize_answer("267.00 to 266.00", None)["accepted_ranges"] == [{"min": "266.00", "max": "267.00"}]


def test_keys_sync_dry_run_filters_the_manifest(tmp_path: Path, capsys) -> None:  # type: ignore[no-untyped-def]
    import json

    from pxw.cli import main

    m = tmp_path / "keys.json"
    m.write_text(json.dumps({"keys": [
        {"exam": "jee-main", "year": 2019, "format": "nta_final", "source": "NTA", "label": "a", "url": "https://nta.ac.in/a.pdf", "allowed_hosts": ["nta.ac.in"]},
        {"exam": "jee-main", "year": 2025, "format": "nta_final", "source": "NTA", "label": "b", "url": "https://nta.ac.in/b.pdf", "allowed_hosts": ["nta.ac.in"]},
    ]}), encoding="utf-8")
    assert main(["--work-dir", str(tmp_path / "w"), "keys", "sync", "--manifest", str(m), "--year", "2025", "--dry-run"]) == 0
    out = [json.loads(x) for x in capsys.readouterr().out.splitlines() if x.startswith("{")]
    assert [e["label"] for e in out[-1]["entries"]] == ["b"]


def test_shipped_answer_key_manifest_is_well_formed() -> None:
    import json

    m = json.loads((Path(__file__).resolve().parents[1] / "manifests" / "answer-keys.manifest.json").read_text(encoding="utf-8"))
    for e in m["keys"]:
        assert {"exam", "year", "format", "source", "url", "allowed_hosts"} <= e.keys()
        host = e["url"].split("/")[2]
        assert host in e["allowed_hosts"], e["url"]
