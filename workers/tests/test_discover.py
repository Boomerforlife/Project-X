"""Offline tests for the discovery crawler (no network; fake get_html)."""

from __future__ import annotations

from pxw.fetch.discover import (
    Catalog,
    CatalogEntry,
    SourceConfig,
    SourcesFile,
    classify,
    crawl_source,
    extract_links,
    merge,
    paper_slug,
    to_manifest,
)
from pxw.fetch.fetcher import FetchError, Manifest

NOW = "2026-01-01T00:00:00Z"
OLD = "2025-01-01T00:00:00Z"


def _slug(exam, url, text, ctx=""):
    meta = classify(url, text, ctx, exam)
    return meta, paper_slug(exam, meta)


def test_adv_paper1_english():
    meta, slug = _slug("jee-advanced", "https://jeeadv.ac.in/past_qps/2025_1_English.pdf",
                       "Download JEE (Advanced) 2025 Paper 1 (English) Paper 1")
    assert meta["kind"] == "QUESTION_PAPER"
    assert meta["year"] == 2025
    assert meta["paper_number"] == 1
    assert meta["language"] == "english"
    assert slug == "jee-advanced-2025-p1"


def test_adv_paper2_hindi():
    meta, slug = _slug("jee-advanced", "https://jeeadv.ac.in/past_qps/2025_2_Hindi.pdf",
                       "Download JEE (Advanced) 2025 Paper 2 (Hindi) Paper 2")
    assert meta["kind"] == "QUESTION_PAPER"
    assert slug == "jee-advanced-2025-p2-hindi"


def test_adv_aat_is_other():
    meta, _ = _slug("jee-advanced", "https://jeeadv.ac.in/past_qps/AAT-2024.pdf",
                    "Download AAT 2024 question paper Download")
    assert meta["kind"] == "OTHER"


def test_main_shift_paper():
    meta, slug = _slug("jee-main", "https://cdnbbsr.s3waas.gov.in/x/uploads/2026/04/20260409481957146.pdf",
                       "B Tech 2nd Apr 2026 Shift 2")
    assert meta["kind"] == "QUESTION_PAPER"
    assert meta["exam_date"] == "2026-04-02"
    assert meta["shift"] == 2
    assert slug == "jee-main-2026-04-02-s2"


def test_main_bulletin_other():
    meta, _ = _slug("jee-main", "https://cdnbbsr.s3waas.gov.in/x/uploads/2026/10/x.pdf", "Information Bulletin")
    assert meta["kind"] == "OTHER"


NEET_URL = "https://cdnbbsr.s3waas.gov.in/x/uploads/2020/09/a.pdf"


def test_neet_bilingual_set():
    meta, slug = _slug("neet-ug", NEET_URL, "Click here to view Eng & Hindi Set E4 NEET QP 2020 PDF 5 MB")
    assert meta["kind"] == "QUESTION_PAPER"
    assert meta["year"] == 2020
    assert meta["set_code"] == "E4"
    assert meta["language"] == "english+hindi"
    assert slug == "neet-ug-2020-set-e4-en-hi"


def test_neet_english_set():
    _, slug = _slug("neet-ug", NEET_URL, "Click here to view English Set E4 NEET QP 2020")
    assert slug == "neet-ug-2020-set-e4"


def test_neet_final_key_reexam():
    meta, slug = _slug("neet-ug", NEET_URL, "download Final Answer Keys for NEET (UG) – 2026 Re-Examination")
    assert meta["kind"] == "ANSWER_KEY"
    assert meta["key_stage"] == "final"
    assert meta["re_exam"] is True
    assert slug == "neet-ug-2026-re-key-final"


def test_neet_challenge_other():
    meta, _ = _slug("neet-ug", NEET_URL, "download Challenge of Provisional Answer Key for NEET")
    assert meta["kind"] == "OTHER"


def test_extract_links():
    html = (
        '<a href="/a.pdf">First  PDF</a><a href="rel/b.pdf#page=2">B</a>'
        '<a href="#top">x</a><a href="mailto:a@b.c">m</a><a href="javascript:void(0)">j</a>'
        '<a href="https://other.org/c.pdf">C</a>'
    )
    links = extract_links(html, "https://example.org/dir/index.html")
    assert [(link.href, link.text) for link in links] == [
        ("https://example.org/a.pdf", "First PDF"),
        ("https://example.org/dir/rel/b.pdf", "B"),
        ("https://other.org/c.pdf", "C"),
    ]


def _cfg(**kw):
    base = {"source": "TEST", "exam": "jee-main", "allowed_hosts": ["good.org"], "seeds": ["https://good.org/"]}
    base.update(kw)
    return SourceConfig(**base)


def _fake(pages, calls=None):
    def get_html(fetcher, url, allowed):
        if calls is not None:
            calls.append(url)
        page = pages[url]
        if isinstance(page, Exception):
            raise page
        return page, url

    return get_html


def _crawl(cfg, pages, calls=None):
    return crawl_source(cfg, None, now=NOW, get_html=_fake(pages, calls))


def test_crawl_host_and_scheme_filter():
    html = (
        '<a href="https://good.org/a.pdf">QP 2024 Shift 1</a><a href="https://evil.org/b.pdf">QP 2024</a>'
        '<a href="http://good.org/c.pdf">QP 2023</a>'
    )
    entries, rep = _crawl(_cfg(), {"https://good.org/": html})
    assert [e.url for e in entries] == ["https://good.org/a.pdf"]
    assert rep.pdf_links == 1
    assert rep.pages == 1


def test_crawl_follow_and_depth():
    pages = {
        "https://good.org/": '<a href="/p1">next</a><a href="/a.pdf">QP 2024 Shift 1</a>',
        "https://good.org/p1": '<a href="/p2">next</a><a href="/b.pdf">QP 2023 Shift 1</a>',
        "https://good.org/p2": '<a href="/c.pdf">QP 2022 Shift 1</a>',
    }
    entries, rep = _crawl(_cfg(follow=[r"/p\d"], max_depth=1), pages)
    assert {e.url for e in entries} == {"https://good.org/a.pdf", "https://good.org/b.pdf"}
    assert rep.pages == 2
    entries, rep = _crawl(_cfg(follow=[r"/p\d"], max_depth=2), pages)
    assert len(entries) == 3
    assert rep.pages == 3
    _, rep = _crawl(_cfg(), pages)  # no follow patterns: seeds only
    assert rep.pages == 1


def test_crawl_max_pages():
    pages = {
        "https://good.org/": '<a href="/p1">x</a><a href="/p2">x</a>',
        "https://good.org/p1": "",
        "https://good.org/p2": "",
    }
    calls: list[str] = []
    _, rep = _crawl(_cfg(follow=[r"/p\d"], max_pages=2), pages, calls)
    assert rep.pages == 2
    assert len(calls) == 2


def test_crawl_include_exclude():
    html = (
        '<a href="/a.pdf">QP 2024 Shift 1</a><a href="/b.pdf">QP 2023 Shift 1</a>'
        '<a href="/c.pdf">QP 2022 Shift 1</a>'
    )
    entries, _ = _crawl(_cfg(include=["2024|2023"]), {"https://good.org/": html})
    assert {e.url.rsplit("/", 1)[1] for e in entries} == {"a.pdf", "b.pdf"}
    entries, _ = _crawl(_cfg(include=["2024|2023"], exclude=["2023"]), {"https://good.org/": html})
    assert [e.url.rsplit("/", 1)[1] for e in entries] == ["a.pdf"]


def test_crawl_error_recorded_and_continues():
    pages = {
        "https://good.org/": '<a href="/p1">x</a><a href="/p2">x</a>',
        "https://good.org/p1": FetchError("HTTP 500"),
        "https://good.org/p2": '<a href="/z.pdf">QP 2024 Shift 1</a>',
    }
    entries, rep = _crawl(_cfg(follow=[r"/p\d"]), pages)
    assert len(rep.errors) == 1
    assert "p1" in rep.errors[0]
    assert "HTTP 500" in rep.errors[0]
    assert [e.url for e in entries] == ["https://good.org/z.pdf"]


def _entry(url, **kw):
    base = {"url": url, "source": "TEST", "exam": "jee-main", "kind": "QUESTION_PAPER", "title": "t",
            "found_on": "https://good.org/", "first_seen": OLD, "last_seen": OLD}
    base.update(kw)
    return CatalogEntry(**base)


def test_merge():
    cat = Catalog(entries={"https://good.org/a.pdf": _entry("https://good.org/a.pdf", year=2024)})
    new = [
        _entry("https://good.org/a.pdf", year=2024, first_seen=NOW, last_seen=NOW),
        _entry("https://good.org/b.pdf", year=2023, first_seen=NOW, last_seen=NOW),
    ]
    assert merge(cat, new, NOW) == (1, 1)
    old = cat.entries["https://good.org/a.pdf"]
    assert old.first_seen == OLD
    assert old.last_seen == NOW
    assert cat.generated_at == NOW
    assert list(cat.entries) == ["https://good.org/a.pdf", "https://good.org/b.pdf"]  # year desc


def test_to_manifest():
    good = _entry("https://good.org/a.pdf", year=2024, paper_slug="jee-main-2024-s1", shift=1, exam_date="2024-01-27")
    other = _entry("https://good.org/o.pdf", kind="OTHER", year=2024, paper_slug="x")
    noyear = _entry("https://good.org/n.pdf", paper_slug="x")
    noslug = _entry("https://good.org/s.pdf", year=2024)
    cat = Catalog(entries={e.url: e for e in (good, other, noyear, noslug)})
    sources = SourcesFile(sources=[
        _cfg(),
        _cfg(source="UNUSED", allowed_hosts=["unused.org"], seeds=["https://unused.org/"]),
    ])
    out = to_manifest(cat, sources)
    assert [e["url"] for e in out["entries"]] == ["https://good.org/a.pdf"]
    assert out["allowed_hosts"] == {"TEST": ["good.org"]}
    m = Manifest.model_validate(out)
    assert m.entries[0].paper_slug == "jee-main-2024-s1"
    assert m.entries[0].shift == 1
    assert to_manifest(cat, sources, since="2026-01-01")["entries"] == []
