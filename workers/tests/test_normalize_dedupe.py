import copy

from conftest import make_ctx, make_doc_input

from pxw.common.hashing import sha256_hex
from pxw.common.models import NormalizedQuestion
from pxw.db.file_repo import FileIngestionRepo, exam_uuid
from pxw.dedupe.dedupe import run_dedupe
from pxw.devtools.synthetic import make_question_pdf
from pxw.normalize.text import build_normalized_text, content_hash, normalize_text
from pxw.pipeline.process_document import run_document


def test_normalize_text_rules():
    assert normalize_text("A  Body\tOF mass 2 kg!") == "a body of mass 2 kg"
    assert normalize_text("ＡＢ") == "ab"  # NFKC
    assert normalize_text("x = (a+b)/2; [y] {z} < 3, > 1.5") == "x = (a+b)/2 [y] {z} < 3, > 1.5"
    assert normalize_text("$\\frac{1}{2}$ and \\sqrt{x}") == "\\frac {1}{2} and \\sqrt {x}"
    assert normalize_text("x_1^2") == "x1^2"


def test_normalized_text_layout_and_hash_stability():
    nt = build_normalized_text("What is  X?", [("B", "Two"), ("A", "One")])
    assert nt == "what is x || one | two"
    assert content_hash(nt) == sha256_hex(nt)
    assert build_normalized_text("what is x", [("A", "one"), ("B", "two")]) == nt
    assert build_normalized_text("Q", []) == "q || "


def test_pipeline_output_hash_matches_normalized_text(synth_nta, tmp_path):
    res = run_document(make_doc_input(synth_nta.pdf), make_ctx(tmp_path))
    for q in res["_questions"]:
        NormalizedQuestion.model_validate(q)
        assert q["content_hash"] == sha256_hex(q["normalized_text"])
        assert " || " in q["normalized_text"]
    # re-run on an identical document in a fresh work dir -> identical hashes
    res2 = run_document(make_doc_input(synth_nta.pdf), make_ctx(tmp_path / "again"))
    assert [q["content_hash"] for q in res["_questions"]] == [q["content_hash"] for q in res2["_questions"]]


class FakeRepo:
    def __init__(self, exact=None, near=None):
        self._exact, self._near = exact or {}, near or {}

    def exact_duplicates(self, h, *, exclude_source_document_id=None):
        return self._exact.get(h, [])

    def near_duplicates(self, text, thr, *, exclude_source_document_id=None):
        return self._near.get(text, [])


def _q(num, text):
    return {"question_number": num, "normalized_text": text, "content_hash": sha256_hex(text)}


def test_exact_duplicate_is_flagged():
    qs = [_q("1", "alpha beta gamma"), _q("2", "totally different words here")]
    d = run_dedupe(qs, FakeRepo(exact={qs[0]["content_hash"]: ["q-existing"]}))
    assert d[0]["status"] == "DUPLICATE" and d[0]["duplicate_of_question_id"] == "q-existing"
    assert d[1]["status"] == "NORMALIZED" and d[1]["warnings"] == []


def test_db_near_duplicate_stays_normalized_with_warning():
    qs = [_q("1", "alpha beta gamma")]
    d = run_dedupe(qs, FakeRepo(near={"alpha beta gamma": [("q-9", 0.93)]}))
    assert d[0]["status"] == "NORMALIZED"
    assert d[0]["possible_duplicate_of"] == "q-9" and d[0]["duplicate_similarity"] == 0.93
    assert d[0]["warnings"] == ["POSSIBLE_DUPLICATE"]


def test_in_batch_near_duplicate_threshold_95():
    base = " ".join(f"word{i}" for i in range(40)) + " || a | b"
    near = base.replace("word3 ", "")  # 1 token missing out of 40 -> token_set_ratio ~ 100
    far = "completely other content about chemistry bonding || x | y"
    d = run_dedupe([_q("1", base), _q("2", near), _q("3", far)], None)
    assert d[0]["warnings"] == [] and d[2]["warnings"] == []
    assert d[1]["warnings"] == ["POSSIBLE_DUPLICATE_IN_BATCH"] and d[1]["duplicate_similarity"] >= 0.95
    assert d[1]["possible_duplicate_of"] is None  # no question id exists for in-batch matches


def test_exact_duplicate_against_promoted_questions_file_repo(tmp_path):
    repo = FileIngestionRepo(tmp_path / "db")
    exam_id = exam_uuid("jee-main")
    a = make_question_pdf("nta_cbt_v1", 4).pdf
    b = make_question_pdf("nta_cbt_v1", 4, with_footer=False).pdf  # different bytes, same question content
    assert a != b
    from pxw.common.models import SourceDocumentIn

    ids = []
    for pdf in (a, b):
        did, _ = repo.register_document(
            SourceDocumentIn(source_code="PROJECTX_EDITORIAL", r2_key=f"k{len(ids)}", original_filename="x.pdf",
                             bytes=len(pdf), sha256=make_doc_input(pdf).sha256)
        )
        ids.append(did)
    ctx = make_ctx(tmp_path / "w", repo=repo)
    r1 = run_document(make_doc_input(a, ids[0]), ctx, exam_id=exam_id, auto_promote=True)
    assert r1["promoted"] == 4
    r2 = run_document(make_doc_input(b, ids[1]), ctx, exam_id=exam_id, auto_promote=True)
    assert r2["persisted"] == {"DUPLICATE": 4} and r2["promoted"] == 0
    # reprocessing the first document is not flagged as duplicate of its own promoted questions
    r1b = run_document(make_doc_input(a, ids[0]), ctx, exam_id=exam_id, auto_promote=True)
    assert "DUPLICATE" not in r1b["persisted"]
    assert repo.counts()["questions"] == 4


def test_apply_decision_merges_warnings():
    from pxw.pipeline.process_document import apply_decision

    q = {"extraction": {"warnings": ["A"]}}
    out = apply_decision(copy.deepcopy(q), {"warnings": ["A", "B"]})
    assert out["extraction"]["warnings"] == ["A", "B"] and q["extraction"]["warnings"] == ["A"]
