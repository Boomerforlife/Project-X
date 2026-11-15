"""Content import: seed taxonomy parser (against the real supabase/seed files) and every validation rule."""

from __future__ import annotations

import copy
from collections.abc import Sequence

import pytest

from pxw.content.schema import RawRecord
from pxw.content.taxonomy import default_seed_dir, parse_seed_taxonomy, slugify
from pxw.content.validate import PaperInfo, SourceInfo, validate_records

TAX = parse_seed_taxonomy()

GOOD = {
    "source": "PROJECTX_EDITORIAL", "licence": "Owned: test rows", "source_ref": "internal:1", "exam": "jee-main",
    "subject": "PHYSICS", "chapter": "kinematics", "topic": "projectile-motion", "type": "SINGLE_MCQ",
    "difficulty": "EASY", "stem": r"A ball of mass $m$ falls. Its acceleration is", "answer": "B",
    "options": ["$g$", "$2g$", "$g/2$", "0"], "solution": r"It is $g$.", "external_id": "t-1",
}


def rec(i: int = 1, **over) -> RawRecord:
    d = copy.deepcopy(GOOD)
    d.update(over)
    d = {k: v for k, v in d.items() if v is not None}
    return RawRecord(i, d)


def validate_one(**over):
    return validate_records([rec(**over)], taxonomy=TAX).results[0]


def err_codes(r):
    return {e.code for e in r.errors}


# --- seed taxonomy --------------------------------------------------------------------------------


def test_seed_dir_exists():
    assert default_seed_dir().is_dir()


def test_seed_parser_reads_real_seed_files():
    assert {e.slug for e in TAX.exams} == {"jee-main", "jee-advanced", "neet-ug"}
    assert next(e for e in TAX.exams if e.slug == "jee-main").active
    assert not next(e for e in TAX.exams if e.slug == "neet-ug").active
    jm = {s.code: s for s in TAX.subjects if s.exam_slug == "jee-main"}
    assert set(jm) == {"PHYSICS", "CHEMISTRY", "MATHEMATICS"} and jm["PHYSICS"].slug == "jee-main-physics"
    chapters = {c.subject_slug: [x for x in TAX.chapters if x.subject_slug == c.subject_slug] for c in TAX.chapters}
    assert len(chapters["jee-main-physics"]) == 20
    assert len(chapters["jee-main-chemistry"]) == 20
    assert len(chapters["jee-main-mathematics"]) == 14
    slugs = {c.slug for c in TAX.chapters}
    assert "jee-main-physics-kinematics" in slugs
    assert "jee-main-physics-work-energy-and-power" in slugs  # comma stripped like app_private.slugify
    assert len(TAX.topics) >= 20
    # apostrophes ('' in SQL) become '-' like the DB slugify: "Newton's" -> newton-s
    assert "jee-main-physics-laws-of-motion-newton-s-laws-of-motion" in {t.slug for t in TAX.topics}
    # every topic's chapter and chapter's subject exist
    ch = {c.slug for c in TAX.chapters}
    sub = {s.slug for s in TAX.subjects}
    assert all(t.chapter_slug in ch for t in TAX.topics)
    assert all(c.subject_slug in sub for c in TAX.chapters)


def test_slugify_matches_db_helper_examples():
    assert slugify("Work, Energy and Power") == "work-energy-and-power"
    assert slugify("Newton's Laws of Motion") == "newton-s-laws-of-motion"
    assert slugify("  A_b ") == "a-b"


def test_resolve_accepts_code_segment_or_slug_and_reports_mismatch():
    r = TAX.resolve("JEE_MAIN", "physics", "jee-main-physics-kinematics", "projectile-motion")
    assert not r.errors and r.subject_slug == "jee-main-physics" and r.topic_slug.endswith("projectile-motion")
    assert TAX.resolve("jee-main", "jee-main-physics", "kinematics").errors == []
    assert TAX.resolve("nope", "physics", "kinematics").errors[0].code == "UNKNOWN_EXAM"
    assert TAX.resolve("jee-main", "biology", "kinematics").errors[0].code == "UNKNOWN_SUBJECT"
    assert TAX.resolve("jee-main", "physics", "optics-x").errors[0].code == "UNKNOWN_CHAPTER"
    # full slug of another exam's subject
    assert TAX.resolve("jee-main", "jee-advanced-physics", "kinematics").errors[0].code == "TAXONOMY_MISMATCH"
    # a chapter slug from another subject
    assert TAX.resolve("jee-main", "chemistry", "jee-main-physics-kinematics").errors[0].code == "TAXONOMY_MISMATCH"
    # a chapter segment that exists only in another subject is unknown under this one
    assert TAX.resolve("jee-main", "chemistry", "kinematics").errors[0].code == "UNKNOWN_CHAPTER"
    # topic of another chapter
    r = TAX.resolve("jee-main", "physics", "kinematics", "jee-main-physics-laws-of-motion-friction")
    assert r.errors[0].code == "TAXONOMY_MISMATCH"
    assert TAX.resolve("jee-main", "physics", "kinematics", "no-such-topic").errors[0].code == "UNKNOWN_TOPIC"
    assert TAX.resolve("neet-ug", "physics", "kinematics").warnings[0].code == "EXAM_INACTIVE"


# --- row rules ------------------------------------------------------------------------------------


def test_good_row_is_valid_with_hash():
    r = validate_one()
    assert r.status == "valid" and not r.errors
    assert len(r.content_hash) == 64
    assert r.answer_key == {"type": "SINGLE_MCQ", "labels": ["B"]}


def test_missing_source_or_licence_rejected():
    for f in ("source", "licence"):
        res = validate_records([rec(**{f: None})], taxonomy=TAX).results[0]
        assert res.status == "invalid" and f"MISSING_{f.upper()}" in err_codes(res)


def test_placeholder_licence_rejected():
    assert "LICENCE_PLACEHOLDER" in err_codes(validate_one(licence="N/A"))


@pytest.mark.parametrize(
    ("over", "code"),
    [
        ({"options": ["a", "b", "c"]}, "OPTIONS_COUNT"),
        ({"options": None}, "OPTIONS_COUNT"),
        ({"options": ["a", "b", "c", "d", "e"]}, "OPTIONS_COUNT"),
        ({"options": ["a", "", "c", "d"]}, "OPTION_EMPTY"),
        ({"options": ["a", "A ", "c", "d"]}, "OPTIONS_NOT_DISTINCT"),
        ({"answer": "E"}, "ANSWER_NOT_AN_OPTION"),
        ({"answer": "A,B"}, "ANSWER_MULTI_FOR_SINGLE"),
        ({"answer": "x"}, "ANSWER_NOT_AN_OPTION"),
        ({"type": "NUMERICAL", "options": ["1", "2", "3", "4"], "answer": "5"}, "OPTIONS_NOT_ALLOWED"),
        ({"type": "NUMERICAL", "options": None, "answer": "five"}, "ANSWER_NOT_NUMERIC"),
        ({"type": "NUMERICAL", "options": None, "answer": "9..3"}, "ANSWER_RANGE_ORDER"),
        ({"year": 1900}, "INVALID_YEAR"),
        ({"stem": "[EXAMPLE] demo"}, "EXAMPLE_ROW"),
        ({"stem": r"Bad $\frac{1}$ math"}, "LATEX_FRAC_ARGS"),
        ({"options": ["$a", "b", "c", "d"]}, "LATEX_UNCLOSED_MATH"),
        ({"solution": r"$$x"}, "LATEX_UNCLOSED_MATH"),
        ({"stem": "x" * 20001}, "STEM_TOO_LONG"),
    ],
)
def test_bad_rows(over, code):
    assert code in err_codes(validate_one(**over))


def test_numeric_and_multi_good_cases():
    r = validate_one(type="NUMERICAL", options=None, answer="3.9..4.1")
    assert r.status == "valid" and r.answer_key["display_value"] == "4"
    r = validate_one(type="MULTI_MCQ", answer="A,C")
    assert r.status == "valid" and r.answer_key["labels"] == ["A", "C"]
    r = validate_one(type="MULTI_MCQ", answer="A")
    assert r.status == "valid" and r.warnings and any(w.code == "MULTI_SINGLE_ANSWER" for w in r.warnings)


def test_allow_examples_flag():
    res = validate_records([rec(stem="[EXAMPLE] demo stem")], taxonomy=TAX, allow_examples=True).results[0]
    assert res.status == "valid"


@pytest.mark.parametrize(
    ("over", "code"),
    [
        ({"exam": "gate"}, "UNKNOWN_EXAM"),
        ({"subject": "biology"}, "UNKNOWN_SUBJECT"),
        ({"chapter": "no-such-chapter"}, "UNKNOWN_CHAPTER"),
        ({"topic": "no-such-topic"}, "UNKNOWN_TOPIC"),
        ({"chapter": "jee-main-chemistry-atomic-structure"}, "TAXONOMY_MISMATCH"),
    ],
)
def test_taxonomy_errors(over, code):
    assert code in err_codes(validate_one(**over))


def test_warnings_for_missing_optionals():
    r = validate_one(difficulty=None, topic=None, solution=None)
    assert r.status == "valid"
    assert {w.code for w in r.warnings} >= {"NO_DIFFICULTY", "NO_TOPIC", "NO_SOLUTION"}


def test_unknown_fields_warn_not_fail():
    r = validate_one(colour="red")
    assert r.status == "valid" and any(w.code == "UNKNOWN_FIELDS" for w in r.warnings)


def test_unparseable_record():
    rep = validate_records([RawRecord(1, None, "bad line")], taxonomy=TAX)
    assert rep.results[0].errors[0].code == "UNPARSEABLE_ROW" and not rep.ok


def test_duplicates_inside_file_by_normalized_content():
    rep = validate_records(
        [rec(1), rec(2, stem="A BALL of mass $m$ falls.  Its acceleration is"), rec(3, stem="different stem")],
        taxonomy=TAX,
    )
    assert [r.status for r in rep.results] == ["valid", "duplicate", "valid"]
    assert rep.results[1].duplicate_of == "file row 1"
    assert rep.summary["duplicates"] == 1 and rep.ok  # duplicates are skipped, not failures


def test_offline_report_says_not_checked():
    s = validate_records([rec()], taxonomy=TAX).summary["checks"]
    assert s["source_approval"] == s["paper"] == s["dedupe_against_db"] == "not checked (offline)"
    assert s["taxonomy"] == "seed"


# --- DB-backed checks via a fake lookup -----------------------------------------------------------


class FakeLookup:
    def __init__(self, sources=None, existing=None, papers=None):
        self.sources = sources or {}
        self.existing = existing or {}
        self.papers = papers or {}

    def get_sources(self, codes: Sequence[str]):
        return {c: self.sources[c] for c in codes if c in self.sources}

    def existing_hashes(self, hashes):
        return {h: self.existing[h] for h in hashes if h in self.existing}

    def get_papers(self, slugs):
        return {s: self.papers[s] for s in slugs if s in self.papers}


APPROVED = SourceInfo("sid-1", "PROJECTX_EDITORIAL", "EDITORIAL_TEAM", True, True)


def test_db_source_checks():
    db = FakeLookup({"PROJECTX_EDITORIAL": APPROVED, "NTA": SourceInfo("sid-2", "NTA", "OFFICIAL_EXAM_BODY", False, False)})
    rep = validate_records([rec(1), rec(2, source="NTA", stem="other"), rec(3, source="GHOST", stem="more")], taxonomy=TAX, db=db)
    assert rep.results[0].status == "valid" and rep.results[0].source is APPROVED
    assert "SOURCE_NOT_APPROVED" in err_codes(rep.results[1])
    assert "SOURCE_UNKNOWN" in err_codes(rep.results[2])
    assert rep.summary["checks"]["source_approval"] == "checked"


def test_db_flags_reuse_without_approval_and_vice_versa():
    half = SourceInfo("s", "PROJECTX_EDITORIAL", "EDITORIAL_TEAM", True, False)
    assert "SOURCE_NOT_APPROVED" in err_codes(validate_records([rec()], taxonomy=TAX, db=FakeLookup({"PROJECTX_EDITORIAL": half})).results[0])


def test_db_duplicates_against_existing_hashes():
    first = validate_records([rec()], taxonomy=TAX).results[0]
    db = FakeLookup({"PROJECTX_EDITORIAL": APPROVED}, existing={first.content_hash: "questions"})
    res = validate_records([rec()], taxonomy=TAX, db=db).results[0]
    assert res.status == "duplicate" and res.duplicate_of == "questions"
    db = FakeLookup({"PROJECTX_EDITORIAL": APPROVED}, existing={first.content_hash: "source_questions"})
    assert validate_records([rec()], taxonomy=TAX, db=db).results[0].duplicate_of == "source_questions"


def test_db_paper_checks():
    paper = PaperInfo("pid", "jee-main-2024-s1", "jee-main", 2024, 1, "January")
    db = FakeLookup({"PROJECTX_EDITORIAL": APPROVED}, papers={paper.slug: paper})
    ok = validate_records([rec(paper=paper.slug, year=2024)], taxonomy=TAX, db=db).results[0]
    assert ok.status == "valid" and ok.paper is paper
    assert "PAPER_YEAR_MISMATCH" in err_codes(validate_records([rec(paper=paper.slug, year=2023)], taxonomy=TAX, db=db).results[0])
    assert "PAPER_UNKNOWN" in err_codes(validate_records([rec(paper="nope")], taxonomy=TAX, db=db).results[0])
    adv = PaperInfo("p2", "adv-2024", "jee-advanced", 2024)
    db2 = FakeLookup({"PROJECTX_EDITORIAL": APPROVED}, papers={adv.slug: adv})
    assert "PAPER_EXAM_MISMATCH" in err_codes(validate_records([rec(paper=adv.slug)], taxonomy=TAX, db=db2).results[0])
