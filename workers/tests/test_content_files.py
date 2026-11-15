"""Content import: file parsing (CSV / JSON / JSONL), row model and answer parsing."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pxw.content.schema import (
    FileFormatError,
    load_records,
    parse_mcq_answer,
    parse_numeric_answer,
    parse_row,
    parse_text,
)

EXAMPLES = Path(__file__).resolve().parents[1] / "content" / "examples"

BASE = {
    "source": "PROJECTX_EDITORIAL", "licence": "Owned: test", "source_ref": "internal:1", "exam": "jee-main",
    "subject": "PHYSICS", "chapter": "kinematics", "type": "SINGLE_MCQ", "stem": "Pick one", "answer": "A",
    "options": ["1", "2", "3", "4"],
}


def test_examples_parse_in_every_format_and_agree():
    csv_rows = load_records(EXAMPLES / "editorial-sample.csv")
    jsonl_rows = load_records(EXAMPLES / "editorial-sample.jsonl")
    assert len(csv_rows) == len(jsonl_rows) == 3
    for c, j in zip(csv_rows, jsonl_rows, strict=True):
        rc, ic = parse_row(c.data)
        rj, ij = parse_row(j.data)
        assert not ic and not ij
        assert rc.model_dump() == rj.model_dump()
        assert rc.stem.startswith("[EXAMPLE]")
        assert rc.source == "PROJECTX_EDITORIAL"


def test_csv_options_columns_become_list_and_blanks_keep_position():
    text = "source,licence,source_ref,exam,subject,chapter,type,stem,answer,option_a,option_b,option_c,option_d\n" \
           "S,L,R,jee-main,PHYSICS,kinematics,single_mcq,Q,A,x,,z,w\n"
    rec = parse_text(text, "csv")[0]
    row, issues = parse_row(rec.data)
    assert not issues
    assert row.qtype == "SINGLE_MCQ"  # case-insensitive
    assert row.options == ["x", "", "z", "w"]


def test_csv_extra_cells_flagged():
    rec = parse_text("a,b\n1,2,3\n", "csv")[0]
    assert rec.data is None and "more cells" in rec.error


def test_json_array_and_non_object():
    recs = parse_text(json.dumps([BASE, 5]), "json")
    assert recs[0].data["source"] == "PROJECTX_EDITORIAL"
    assert recs[1].data is None
    with pytest.raises(FileFormatError):
        parse_text('{"a": 1}', "json")
    with pytest.raises(FileFormatError):
        parse_text("not json", "json")


def test_jsonl_skips_blank_lines_and_reports_bad_lines():
    text = json.dumps(BASE) + "\n\n{bad json}\n" + json.dumps(BASE) + "\n"
    recs = parse_text(text, "jsonl")
    assert [r.index for r in recs] == [1, 2, 3]
    assert recs[0].data and recs[1].data is None and recs[2].data


def test_load_records_rejects_unknown_suffix(tmp_path):
    p = tmp_path / "x.txt"
    p.write_text("x")
    with pytest.raises(FileFormatError):
        load_records(p)


@pytest.mark.parametrize("missing", ["source", "licence", "source_ref", "exam", "subject", "chapter", "type", "stem", "answer"])
def test_required_fields_are_never_defaulted(missing):
    data = {k: v for k, v in BASE.items() if k != missing}
    row, issues = parse_row(data)
    assert row is None
    assert any(i.code == f"MISSING_{missing.upper()}" for i in issues)


@pytest.mark.parametrize("field", ["source", "licence"])
def test_blank_source_or_licence_rejected(field):
    row, issues = parse_row({**BASE, field: "   "})
    assert row is None and issues[0].code == f"MISSING_{field.upper()}"


def test_license_spelling_accepted_and_types_coerced():
    data = {k: v for k, v in BASE.items() if k != "licence"}
    data["license"] = "CC BY 4.0"
    data.update(year="2024", question_number=7, difficulty="hard")
    row, issues = parse_row(data)
    assert not issues
    assert row.licence == "CC BY 4.0" and row.year == 2024 and row.question_number == "7" and row.difficulty == "HARD"


def test_bad_enum_and_year():
    _, issues = parse_row({**BASE, "type": "ESSAY"})
    assert issues[0].code == "INVALID_TYPE"
    _, issues = parse_row({**BASE, "year": "1900"})
    assert issues[0].code == "INVALID_YEAR"
    _, issues = parse_row({**BASE, "difficulty": "IMPOSSIBLE"})
    assert issues[0].code == "INVALID_DIFFICULTY"


def test_mcq_answer_parsing():
    assert parse_mcq_answer("a", 4, False) == (["A"], [])
    assert parse_mcq_answer("A, c", 4, True) == (["A", "C"], [])
    _, issues = parse_mcq_answer("A,B", 4, False)
    assert issues[0].code == "ANSWER_MULTI_FOR_SINGLE"
    _, issues = parse_mcq_answer("E", 4, False)
    assert issues[0].code == "ANSWER_NOT_AN_OPTION"
    _, issues = parse_mcq_answer("A,A", 4, True)
    assert issues[0].code == "ANSWER_INVALID"
    _, issues = parse_mcq_answer("", 4, False)
    assert issues


def test_numeric_answer_parsing_matches_contract():
    key, issues = parse_numeric_answer("4")
    assert not issues
    assert key == {"type": "NUMERICAL", "accepted_ranges": [{"min": "4", "max": "4"}], "display_value": "4"}
    key, _ = parse_numeric_answer("3.9..4.1")
    assert key["accepted_ranges"] == [{"min": "3.9", "max": "4.1"}] and key["display_value"] == "4"
    key, _ = parse_numeric_answer("-2.5; 10..12")
    assert len(key["accepted_ranges"]) == 2 and key["display_value"] == "-2.5"
    for bad in ["abc", "1e3", "+5", "1,5", "5..1", "", "1.", ".5", "1..", "1" * 21]:
        key, issues = parse_numeric_answer(bad)
        assert key is None and issues, bad
    key, issues = parse_numeric_answer(";".join(["1"] * 6))
    assert key is None and issues
