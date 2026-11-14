"""Segmentation on generated synthetic PDFs (NTA CBT + generic numbered layouts)."""

from __future__ import annotations

from conftest import make_ctx, make_doc_input

from pxw.devtools.synthetic import make_question_pdf
from pxw.extraction.layout_profiles import get_profile
from pxw.extraction.segment import segment_lines
from pxw.pipeline.process_document import run_document


def _lines(*texts):
    return [{"page": 1, "text": t, "bbox": [72, 100 + 16 * i, 300, 112 + 16 * i], "source": "TEXT", "conf": None}
            for i, t in enumerate(texts)]


def run(pdf, tmp_path, layout="auto"):
    res = run_document(make_doc_input(pdf), make_ctx(tmp_path), layout=layout)
    return res["_questions"], res


def test_nta_counts_options_ids_and_types(synth_nta, tmp_path):
    qs, res = run(synth_nta.pdf, tmp_path)
    assert res["layout"] == "nta_cbt_v1"
    assert [q["question_number"] for q in qs] == [str(i) for i in range(1, 8)]
    assert [len(q["options"]) for q in qs] == [4, 4, 4, 4, 4, 0, 0]
    assert [q["question_type_guess"] for q in qs] == ["SINGLE_MCQ"] * 5 + ["NUMERICAL"] * 2
    assert qs[0]["external_question_id"] == "4054550010"
    assert [o["external_option_id"] for o in qs[0]["options"]] == ["4054550011", "4054550012", "4054550013", "4054550014"]
    assert [o["label"] for o in qs[0]["options"]] == ["A", "B", "C", "D"]
    assert [q["section_hint"] for q in qs] == ["PHYSICS"] * 3 + ["CHEMISTRY"] + ["MATHEMATICS"] * 3
    assert all(q["extraction"]["warnings"] == [] for q in qs)
    # footer must not leak into the last option / numerical stem
    assert "SYNTHETIC FIXTURE" not in qs[2]["options"][3]["content"][0]["text"]
    assert "SYNTHETIC FIXTURE" not in qs[6]["question_text"]


def test_generic_layout_inline_options(synth_generic, tmp_path):
    qs, res = run(synth_generic.pdf, tmp_path, layout="generic_numbered")
    assert res["layout"] == "generic_numbered"
    assert len(qs) == 7
    q1 = qs[0]
    assert [o["label"] for o in q1["options"]] == ["A", "B", "C", "D"]
    assert [o["content"][0]["text"] for o in q1["options"]] == ["6", "12", "18", "24"]  # (C) x   (D) y on one line
    assert qs[5]["question_type_guess"] == "NUMERICAL" and qs[5]["options"] == []
    assert qs[0]["external_question_id"] is None


def test_auto_detects_generic(synth_generic, tmp_path):
    _, res = run(synth_generic.pdf, tmp_path, layout="auto")
    assert res["layout"] == "generic_numbered"


def test_figure_captured_as_asset_and_image_block(synth_nta, tmp_path):
    qs, _ = run(synth_nta.pdf, tmp_path)
    q3 = qs[2]
    assert len(q3["assets"]) == 1
    a = q3["assets"][0]
    assert a["asset_ref"] == "q3-fig1" and a["asset_id"] is None and a["page"] >= 1
    assert a["r2_key"] == "derived/doc-1/crops/q3-1.png" and a["mime_type"] == "image/png"
    assert a["width"] > 100 and a["height"] > 100 and len(a["sha256"]) == 64
    assert {"type": "image", "asset_ref": "q3-fig1", "alt": ""} in q3["content"]
    assert (tmp_path / make_doc_input(synth_nta.pdf).sha256 / "crops" / "q3-1.png").read_bytes()[:4] == b"\x89PNG"
    assert all(not q["assets"] for i, q in enumerate(qs) if i != 2)


def test_multi_mcq_and_option_count_warning():
    spec = get_profile("nta_cbt_v1")
    raw = segment_lines(
        _lines("Q.1 Choose one or more correct answers.", "(1) a", "(2) b", "(3) c", "Question ID : 4000000001"), spec
    )
    assert len(raw) == 1 and len(raw[0]["options"]) == 3
    from pxw.normalize.normalize import normalize_question

    q = normalize_question(raw[0], [], min_confidence=0.6)
    assert q["question_type_guess"] == "MULTI_MCQ"
    assert "OPTION_COUNT_UNUSUAL" in q["extraction"]["warnings"]


def test_option_markers_must_follow_sequence():
    spec = get_profile("generic_numbered")
    raw = segment_lines(_lines("1. Stem with list", "(B) not an option yet", "(A) first", "(B) second"), spec)
    assert [o["label"] for o in raw[0]["options"]] == ["A", "B"]
    assert "(B) not an option yet" in raw[0]["stem"][1]


def test_generic_requires_sequential_question_numbers():
    spec = get_profile("generic_numbered")
    raw = segment_lines(_lines("1. First", "7. is just text", "2. Second"), spec)
    assert [q["number"] for q in raw] == ["1", "2"]


def test_numbering_restart_keeps_numbers_unique():
    spec = get_profile("nta_cbt_v1")
    raw = segment_lines(
        _lines("Section : Physics", "Q.1 a", "Section : Chemistry", "Q.1 b"), spec
    )
    assert [q["number"] for q in raw] == ["1", "1-CHEMISTRY"]


def test_numerical_via_section_header_and_given_answer():
    spec = get_profile("nta_cbt_v1")
    raw = segment_lines(_lines("Section B (Numerical)", "Q.21 Enter the value.", "Given Answer : ____"), spec)
    assert raw[0]["numerical_mode"] is True and raw[0]["options"] == [] and raw[0]["given_answer_hint"] is True


def test_unicode_math_pdf_produces_latex(tmp_path):
    doc = make_question_pdf("nta_cbt_v1", 5, unicode_math=True)
    qs, _ = run(doc.pdf, tmp_path)
    assert "\\sqrt{29}" in qs[1]["options"][0]["content"][0]["text"]
    assert "x^{2}" in qs[1]["question_text"]
    assert "\\theta" in qs[4]["question_text"] and "\\leq" in qs[4]["question_text"]
    assert qs[1]["extraction"]["warnings"] == []
