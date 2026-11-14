from pxw.answer_keys.parse import extract_key_lines, parse_answer, parse_key_lines
from pxw.devtools.synthetic import make_answer_key_pdf
from pxw.pipeline.parse_answer_key import parse_key_pdf


def test_option_ids():
    assert parse_answer("4054558901") == {"kind": "EXTERNAL_OPTION_IDS", "ids": ["4054558901"]}
    assert parse_answer("4054558901, 4054558902") == {"kind": "EXTERNAL_OPTION_IDS", "ids": ["4054558901", "4054558902"]}
    assert parse_answer("4054558901 and 12345678") == {"kind": "EXTERNAL_OPTION_IDS", "ids": ["4054558901", "12345678"]}


def test_labels_and_digits_map_1_to_a():
    assert parse_answer("B") == {"kind": "OPTION_LABELS", "labels": ["B"]}
    assert parse_answer("3") == {"kind": "OPTION_LABELS", "labels": ["C"]}
    assert parse_answer("1,3") == {"kind": "OPTION_LABELS", "labels": ["A", "C"]}
    assert parse_answer("a, d") == {"kind": "OPTION_LABELS", "labels": ["A", "D"]}


def test_numeric_and_ranges():
    assert parse_answer("2.5") == {"kind": "NUMERIC", "accepted_ranges": [{"min": "2.5", "max": "2.5"}]}
    assert parse_answer("25") == {"kind": "NUMERIC", "accepted_ranges": [{"min": "25", "max": "25"}]}
    assert parse_answer("-3") == {"kind": "NUMERIC", "accepted_ranges": [{"min": "-3", "max": "-3"}]}
    assert parse_answer("2.4 to 2.6")["accepted_ranges"] == [{"min": "2.4", "max": "2.6"}]
    assert parse_answer("2.4-2.6")["accepted_ranges"] == [{"min": "2.4", "max": "2.6"}]
    assert parse_answer("2.6 to 2.4")["accepted_ranges"] == [{"min": "2.4", "max": "2.6"}]


def test_drop_bonus_and_garbage():
    assert parse_answer("Drop") == {"kind": "DROPPED"}
    assert parse_answer("BONUS") == {"kind": "DROPPED"}
    assert parse_answer("???") is None and parse_answer("") is None and parse_answer("E7") is None


def test_rows_from_lines():
    lines = [
        "SYNTHETIC ANSWER KEY",
        "Question  Answer",
        "1 B",
        "Q.2 3",
        "3. 2.4 to 2.6",
        "4 Drop",
        "5 1,3",
        "6 4054551234 4054558901",
        "7 4054551235 4054558901, 4054558902",
        "4054551236 4054558903",
        "8 4054558904",
        "9 garbage here",
        "10",
        "12 -3",
        "Page 1 of 2",
    ]
    rows, unparsed = parse_key_lines(lines)
    by = {(r["question_number"], r["external_question_id"]): r for r in rows}
    assert by[("1", None)]["normalized_answer"] == {"kind": "OPTION_LABELS", "labels": ["B"]}
    assert by[("2", None)]["normalized_answer"]["labels"] == ["C"]
    assert by[("3", None)]["normalized_answer"]["kind"] == "NUMERIC"
    assert by[("4", None)]["is_dropped"] is True and by[("4", None)]["raw_answer"] == "Drop"
    assert by[("5", None)]["normalized_answer"]["labels"] == ["A", "C"]
    assert by[("6", "4054551234")]["normalized_answer"]["ids"] == ["4054558901"]
    assert by[("7", "4054551235")]["normalized_answer"]["ids"] == ["4054558901", "4054558902"]
    assert by[(None, "4054551236")]["normalized_answer"]["ids"] == ["4054558903"]
    assert by[("8", None)]["normalized_answer"]["ids"] == ["4054558904"]
    assert by[("12", None)]["normalized_answer"]["accepted_ranges"] == [{"min": "-3", "max": "-3"}]
    assert unparsed == ["9 garbage here", "10"]


def test_multi_column_pairs_and_duplicates():
    rows, unparsed = parse_key_lines(["1 A 2 B 3 C", "1 D"])
    assert [(r["question_number"], r["normalized_answer"]["labels"]) for r in rows] == [
        ("1", ["A"]), ("2", ["B"]), ("3", ["C"])
    ]
    assert unparsed == ["1 D"]  # repeated question number is reported, first one wins


def test_pdf_roundtrip_and_official_key_shape(tmp_path):
    pdf = tmp_path / "key.pdf"
    pdf.write_bytes(make_answer_key_pdf(["1 A", "2 4054558901", "3 2.4 to 2.6", "4 Drop", "5 ???"]))
    assert "1 A" in extract_key_lines(pdf)
    keys, unparsed = parse_key_pdf(pdf, "paper-1", "doc-1")
    assert [k.question_number for k in keys] == ["1", "2", "3", "4"]
    assert unparsed == ["5 ???"]
    k = keys[3]
    assert k.model_dump() == {
        "paper_id": "paper-1", "source_document_id": "doc-1", "question_number": "4", "external_question_id": None,
        "raw_answer": "Drop", "normalized_answer": {"kind": "DROPPED"}, "is_dropped": True,
    }
