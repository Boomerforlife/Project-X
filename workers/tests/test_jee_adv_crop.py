"""JEE Advanced booklet reader on a synthetic text-layer booklet (no real papers in the repo)."""

from __future__ import annotations

from pathlib import Path

import pymupdf
import pytest

from pxw.answer_keys.printed import normalize_printed_answer
from pxw.extraction.jee_adv_crop import extract_jee_adv

DOC_ID = "00000000-0000-4000-8000-0000000000a1"
FILLER = "Let the value of the quantity in the given system be found and is to be computed as stated in the question."


def _booklet(path: Path) -> dict[str, float]:
    """Two subjects; Mathematics has a single-answer and a multi-answer section, Physics a numerical one.
    Every question carries a printed "Answer:" box. Returns the y of each answer line, by question id."""
    doc = pymupdf.open()
    answer_y: dict[str, float] = {}

    def page(lines: list[tuple[str, float, float]]) -> None:
        p = doc.new_page(width=595, height=842)
        p.insert_text((250, 25), "JEE (Advanced) 2099", fontsize=9)
        for text, x, y in lines:
            p.insert_text((x, y), text, fontsize=10)

    page([
        ("Mathematics", 260, 60),
        ("SECTION 1 (Maximum Marks: 12)", 220, 90),
        ("Each question has FOUR options (A), (B), (C) and (D). ONLY ONE of these four options is the correct answer.", 70, 110),
        ("Full Marks : +3 ONLY if the correct numerical value is entered;", 70, 125),
        ("Q.1  " + FILLER, 60, 160), ("the plane is fixed.", 90, 175),
        ("(A) 1   (B) 2   (C) 3   (D) 4", 90, 200),
        ("Answer: C", 90, 230),
        ("Q.2  " + FILLER, 60, 300), ("section of the mirror and the ray lie on the same plane.", 90, 315),
        ("(A) 5   (B) 6   (C) 7   (D) 8", 90, 340),
        ("Answer: B", 90, 370),
    ])
    answer_y["M1"], answer_y["M2"] = 230, 370
    page([
        ("SECTION 2 (Maximum Marks: 8)", 220, 90),
        ("Each question has FOUR options. ONE OR MORE THAN ONE of these four option(s) is(are) correct answer(s).", 70, 110),
        ("Q.3  " + FILLER, 60, 160),
        ("(A) a   (B) b   (C) c   (D) d", 90, 190),
        ("Answer: A, C", 90, 220),
    ])
    answer_y["M3"] = 220
    page([
        ("Physics", 270, 60),
        ("SECTION 1 (Maximum Marks: 12)", 220, 90),
        ("This section contains FOUR (04) questions. The answer to each question is a NUMERICAL VALUE.", 70, 110),
        ("Q.1  " + FILLER, 60, 160),
        ("Answer: [2.2 to 2.3]", 90, 200),
    ])
    answer_y["P1"] = 200
    doc.save(str(path))
    return answer_y


@pytest.fixture()
def booklet(tmp_path: Path) -> tuple[dict, dict[str, float]]:
    pdf = tmp_path / "adv.pdf"
    ys = _booklet(pdf)
    return extract_jee_adv(pdf, DOC_ID, tmp_path / "crops"), ys


def test_structure_types_and_subjects(booklet: tuple[dict, dict[str, float]]) -> None:
    r, _ = booklet
    got = [(q["external_question_id"], q["section_hint"], q["question_type_guess"]) for q in r["questions"]]
    assert got == [
        ("M1", "MATHEMATICS", "SINGLE_MCQ"),
        ("M2", "MATHEMATICS", "SINGLE_MCQ"),  # "section of the mirror ..." in a stem is not a section heading
        ("M3", "MATHEMATICS", "MULTI_MCQ"),
        ("P1", "PHYSICS", "NUMERICAL"),  # marking-scheme lines never override the section's defining sentence
    ]
    assert all(not q["extraction"]["warnings"] for q in r["questions"])
    assert [o["label"] for o in r["questions"][0]["options"]] == ["A", "B", "C", "D"]
    assert r["questions"][3]["options"] == []


def test_printed_answers_are_captured_and_never_inside_crops(booklet: tuple[dict, dict[str, float]]) -> None:
    r, answer_y = booklet
    assert r["printed_answers"] == {"M1": "C", "M2": "B", "M3": "A, C", "P1": "[2.2 to 2.3]"}
    assert r["stats"]["dropped_answer_in_crop"] == []
    for q in r["questions"]:
        a = q["assets"][-1]
        # insert_text y is the baseline; the answer text's top is ~8pt above it. The crop must end before that.
        assert a["bbox"][3] < answer_y[q["external_question_id"]] - 8, q["external_question_id"]
        assert "Answer" not in q["question_text"]


def test_second_stem_line_is_kept(booklet: tuple[dict, dict[str, float]]) -> None:
    r, _ = booklet
    assert "section of the mirror" in r["questions"][1]["question_text"]


def test_crops_written(booklet: tuple[dict, dict[str, float]], tmp_path: Path) -> None:
    r, _ = booklet
    for q in r["questions"]:
        for a in q["assets"]:
            assert (tmp_path / "crops" / a["r2_key"].rsplit("/", 1)[-1]).is_file()
    assert len({q["content_hash"] for q in r["questions"]}) == len(r["questions"])


def test_glued_marker_and_missing_number_are_handled(tmp_path: Path) -> None:
    """OCR often glues the number to the stem ("Q.2Which"); a marker it never read leaves a gap (2 -> 4), and the
    question before the gap is flagged so it is reviewed, not auto-promoted as a possible two-in-one crop."""
    doc = pymupdf.open()
    p = doc.new_page(width=595, height=842)
    for text, y in [
        ("Chemistry", 60),
        ("SECTION 1 (Maximum Marks: 12)", 90),
        ("Each question has FOUR options. ONLY ONE of these four options is the correct answer.", 110),
        ("Q.1  " + FILLER, 160),
        ("Q.2Which of the following is true? " + FILLER, 260),
        ("Q.4  " + FILLER, 420),
        ("Q3, respectively, are the points named in the figure of the question.", 470),
    ]:
        p.insert_text((60, y), text, fontsize=10)
    pdf = tmp_path / "gap.pdf"
    doc.save(str(pdf))
    r = extract_jee_adv(pdf, DOC_ID, tmp_path / "crops")
    assert [q["external_question_id"] for q in r["questions"]] == ["C1", "C2", "C4"]
    warn = {q["external_question_id"]: q["extraction"]["warnings"] for q in r["questions"]}
    assert warn == {"C1": [], "C2": ["POSSIBLE_MERGED_QUESTIONS"], "C4": []}


@pytest.mark.parametrize(
    ("raw", "qtype", "want"),
    [
        ("C", "SINGLE_MCQ", {"kind": "OPTION_LABELS", "labels": ["C"]}),
        ("(A), (C)", "MULTI_MCQ", {"kind": "OPTION_LABELS", "labels": ["A", "C"]}),
        ("A, C", "SINGLE_MCQ", {"kind": "DROPPED"}),
        ("6", "NUMERICAL", {"kind": "NUMERIC", "accepted_ranges": [{"min": "6", "max": "6"}]}),
        ("[-7.2 to -7]", "NUMERICAL", {"kind": "NUMERIC", "accepted_ranges": [{"min": "-7.2", "max": "-7"}]}),
        (
            "[75 to 79] OR [94 to 95]",
            "NUMERICAL",
            {"kind": "NUMERIC", "accepted_ranges": [{"min": "75", "max": "79"}, {"min": "94", "max": "95"}]},
        ),
        ("C", "NUMERICAL", {"kind": "DROPPED"}),
        ("5", "SINGLE_MCQ", {"kind": "DROPPED"}),
        ("Bonus", "MULTI_MCQ", {"kind": "DROPPED"}),
    ],
)
def test_normalize_printed_answer(raw: str, qtype: str, want: dict) -> None:
    assert normalize_printed_answer(raw, qtype) == want
