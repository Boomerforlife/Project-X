"""Discovery crawler: finds official question-paper / answer-key PDFs on allow-listed exam-body pages.

It never downloads PDFs. It reads a small number of HTML index pages (robots.txt honoured, throttled,
https only, allow-listed hosts only, same guards as the Fetcher), extracts PDF links, classifies them
(exam, year, kind, shift, date, language) and merges them into a JSON catalogue. The catalogue can then
emit a `pxw ingest fetch` manifest for entries that are question papers or answer keys.

Downloading and ingestion stay behind the existing approval gate: `pxw ingest fetch` refuses any source
that has not been licence-approved in the database. Discovery itself stores only public URLs and metadata.

Run without the full worker install (only pydantic is needed):
    PYTHONPATH=workers/src python -m pxw.fetch.discover --sources workers/scraper/sources.json \
        --catalog workers/scraper/catalog.json --manifest-out .local/work/manifest.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from pxw.fetch.fetcher import DEFAULT_USER_AGENT, MAX_REDIRECTS, Fetcher, FetchError, host_allowed

MAX_HTML_BYTES = 3 * 1024 * 1024
Kind = Literal["QUESTION_PAPER", "ANSWER_KEY", "OTHER"]


# ---------------------------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------------------------


class SourceConfig(BaseModel):
    """One crawlable source. `allowed_hosts` covers the index pages AND the hosts PDFs are served from."""

    source: str = Field(pattern=r"^[A-Z][A-Z0-9_]*$")
    exam: str = Field(pattern=r"^[a-z0-9-]+$")
    allowed_hosts: list[str] = Field(min_length=1)
    seeds: list[str] = Field(min_length=1)
    follow: list[str] = Field(default_factory=list, description="regexes; same-source HTML links to crawl further")
    max_pages: int = Field(default=15, ge=1, le=200)
    max_depth: int = Field(default=2, ge=0, le=4)
    include: list[str] = Field(default_factory=list, description="regexes on link text+URL; keep only these PDFs")
    exclude: list[str] = Field(default_factory=list, description="regexes on link text+URL; drop these PDFs")
    enabled: bool = True


class SourcesFile(BaseModel):
    user_agent: str | None = None
    min_interval_s: float = Field(default=5.0, ge=1.0)
    sources: list[SourceConfig]


class CatalogEntry(BaseModel):
    url: str
    source: str
    exam: str
    kind: Kind
    title: str
    year: int | None = None
    exam_date: str | None = None
    shift: int | None = None
    paper_number: int | None = None
    language: str | None = None
    set_code: str | None = None
    key_stage: Literal["provisional", "final"] | None = None
    re_exam: bool | None = None
    found_on: str
    first_seen: str
    last_seen: str
    paper_slug: str | None = None


class Catalog(BaseModel):
    generated_at: str | None = None
    entries: dict[str, CatalogEntry] = Field(default_factory=dict)


# ---------------------------------------------------------------------------------------------
# HTML link extraction
# ---------------------------------------------------------------------------------------------


@dataclass
class Link:
    href: str
    text: str
    context: str = ""  # nearest preceding heading/label text, helps classify icon-only links


class _LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[Link] = []
        self._href: str | None = None
        self._text: list[str] = []
        self._ctx: list[str] = []
        self._in_label = 0
        self._label_buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag == "a" and a.get("href"):
            self._href = a["href"]
            self._text = [a.get("title") or "", a.get("aria-label") or ""]
        elif tag in ("h1", "h2", "h3", "h4", "h5", "th", "td", "li", "strong", "b", "p") and self._href is None:
            self._in_label += 1
            self._label_buf = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href is not None:
            text = _squash(" ".join(self._text))
            self.links.append(Link(self._href, text, " ".join(self._ctx[-2:])))
            self._href = None
        elif tag in ("h1", "h2", "h3", "h4", "h5", "th", "td", "li", "strong", "b", "p") and self._in_label:
            self._in_label -= 1
            label = _squash(" ".join(self._label_buf))
            if label and len(label) < 160:
                self._ctx.append(label)

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)
        elif self._in_label:
            self._label_buf.append(data)


def _squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def extract_links(html: str, base_url: str) -> list[Link]:
    p = _LinkParser()
    try:
        p.feed(html)
    except Exception:  # noqa: BLE001, S110 - malformed markup: keep whatever was parsed
        pass
    out: list[Link] = []
    for link in p.links:
        href = link.href.strip()
        if href.startswith(("#", "mailto:", "javascript:", "tel:")):
            continue
        absolute = urllib.parse.urljoin(base_url, href)
        absolute = urllib.parse.urldefrag(absolute)[0]
        out.append(Link(absolute, link.text, link.context))
    return out


def is_pdf_url(url: str) -> bool:
    return urllib.parse.urlparse(url).path.lower().endswith(".pdf")


# ---------------------------------------------------------------------------------------------
# Classification (pure, unit-tested)
# ---------------------------------------------------------------------------------------------

_MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_DATE_RE = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([A-Za-z]{3,9})\.?,?[\s\-]+(20\d{2}|19\d{2})\b")
_YEAR_RE = re.compile(r"(?<!\d)(19[7-9]\d|20\d{2})(?!\d)")
_KEY_RE = re.compile(r"answer[\s_-]*key|\banskey\b|\bans[\s_-]*key\b|\bkey\b", re.IGNORECASE)
_PAPER_RE = re.compile(r"question[\s_-]*paper|past_qps|\bqp\b|\bshift\b|\bpaper[\s_-]*[12]\b|\bb\.?\s*tech\b|_[12](?:_\w+)?\.pdf$", re.IGNORECASE)
_OTHER_RE = re.compile(
    r"syllabus|bulletin|\bfaq\b|notice|advisory|instruction|clarification|schedule|result|admit|"
    r"brochure|information|press|circular|counsel|challenge|key data|dress code|\baat\b|aat-|architecture|b\.?\s*arch|"
    r"planning|paper[\s_-]*2[ab]\b|paper[\s_-]*2\s*\(\s*b\.?\s*(?:arch|plan)",
    re.IGNORECASE,
)


def classify(url: str, text: str, context: str, exam: str) -> dict[str, object]:
    """Best-effort metadata from link text, nearby label and file name. Unknowns stay None."""
    fname = urllib.parse.unquote(urllib.parse.urlparse(url).path.rsplit("/", 1)[-1])
    blob = f"{text} {context} {fname}"
    if _OTHER_RE.search(f"{text} {fname}"):
        kind: Kind = "OTHER"
    elif _KEY_RE.search(blob):
        kind = "ANSWER_KEY"
    elif _PAPER_RE.search(f"{text} {fname}") or "past_qps" in url:
        kind = "QUESTION_PAPER"
    else:
        kind = "OTHER"

    exam_date: str | None = None
    year: int | None = None
    m = _DATE_RE.search(f"{text} {context}")
    if m and m.group(2)[:3].lower() in _MONTHS:
        d, mon, y = int(m.group(1)), _MONTHS[m.group(2)[:3].lower()], int(m.group(3))
        if 1 <= d <= 31:
            exam_date, year = f"{y:04d}-{mon:02d}-{d:02d}", y
    if year is None:
        for src in (text, fname, context):  # file name before context: upload-folder years are not exam years
            ym = _YEAR_RE.search(src or "")
            if ym:
                year = int(ym.group(1))
                break

    shift = None
    sm = re.search(r"shift[\s_-]*(\d)", blob, re.IGNORECASE)
    if sm:
        shift = int(sm.group(1))
    paper_number = None
    pm = re.search(r"paper[\s_-]*([12])\b", f"{text} {context}", re.IGNORECASE) or re.search(r"^(?:19|20)\d{2}_([12])(?:_|\.pdf$)", fname)
    if pm:
        paper_number = int(pm.group(1))
    set_code = None
    scm = re.search(r"\b(?i:set|code)[\s_-]*([A-Z]{1,2}\d{0,2})\b", f"{text} {fname}")
    if scm:
        set_code = scm.group(1).upper()
    stage = None
    if kind == "ANSWER_KEY":
        stage = "final" if re.search(r"\bfinal\b", blob, re.IGNORECASE) else "provisional" if re.search(r"provisional", blob, re.IGNORECASE) else None
    re_exam = bool(re.search(r"re-?\s*exam", blob, re.IGNORECASE))
    lang = None
    if re.search(r"\beng(?:lish)?\s*(?:&|and|\+)\s*hindi\b", blob, re.IGNORECASE):
        lang = "english+hindi"
    lm = None if lang else re.search(r"\b(english|hindi|gujarati|bengali|marathi|tamil|telugu|kannada|malayalam|odia|punjabi|assamese|urdu)\b",
                   blob, re.IGNORECASE)
    if lm:
        lang = lm.group(1).lower()
    elif exam == "jee-advanced" and year is not None and year < 2019:
        lang = "english+hindi"

    title = _squash(text) or _squash(context) or fname
    return {"kind": kind, "year": year, "exam_date": exam_date, "shift": shift, "paper_number": paper_number,
            "language": lang, "set_code": set_code, "key_stage": stage, "re_exam": re_exam or None, "title": title[:200]}


def paper_slug(exam: str, meta: dict[str, object]) -> str | None:
    year = meta.get("year")
    if not year:
        return None
    parts = [exam, str(year)]
    if meta.get("exam_date"):
        parts = [exam, str(meta["exam_date"])]
    if meta.get("shift"):
        parts.append(f"s{meta['shift']}")
    if meta.get("paper_number"):
        parts.append(f"p{meta['paper_number']}")
    if meta.get("re_exam"):
        parts.append("re")
    if meta.get("set_code"):
        parts.append(f"set-{str(meta['set_code']).lower()}")
    lang = meta.get("language")
    if lang == "english+hindi":
        parts.append("en-hi")
    elif lang and lang != "english":
        parts.append(str(lang))
    if meta.get("kind") == "ANSWER_KEY":
        parts.append("key" if not meta.get("key_stage") else f"key-{meta['key_stage']}")
    return "-".join(parts)


# ---------------------------------------------------------------------------------------------
# Crawler
# ---------------------------------------------------------------------------------------------


@dataclass
class CrawlReport:
    pages: int = 0
    pdf_links: int = 0
    errors: list[str] = field(default_factory=list)


def fetch_html(fetcher: Fetcher, url: str, allowed: list[str]) -> tuple[str, str]:
    """GET an HTML page under the same guards as Fetcher.fetch_pdf (allow-list per hop, robots, throttle)."""
    current = url
    for _hop in range(MAX_REDIRECTS + 1):
        parts = fetcher._check_url(current, allowed)
        if not fetcher._robots_ok(parts, current):
            raise FetchError("refused: disallowed by robots.txt")
        fetcher._throttle(parts.hostname or "")
        req = urllib.request.Request(current, headers={"User-Agent": fetcher.user_agent, "Accept": "text/html"})
        try:
            resp = fetcher._opener.open(req, timeout=fetcher.timeout)
        except urllib.error.HTTPError as exc:
            if exc.code in (301, 302, 303, 307, 308):
                loc = exc.headers.get("Location")
                if not loc:
                    raise FetchError("redirect without Location") from exc
                current = urllib.parse.urljoin(current, loc)
                continue
            raise FetchError(f"HTTP {exc.code} from {parts.hostname}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise FetchError(f"network error: {exc}") from exc
        with resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "html" not in ctype:
                raise FetchError(f"refused: expected HTML, got {ctype or 'no content type'}")
            raw = resp.read(MAX_HTML_BYTES + 1)
            if len(raw) > MAX_HTML_BYTES:
                raise FetchError("refused: page too large")
            charset = "utf-8"
            cm = re.search(r"charset=([\w-]+)", ctype)
            if cm:
                charset = cm.group(1)
            return raw.decode(charset, "replace"), current
    raise FetchError(f"refused: more than {MAX_REDIRECTS} redirects")


def crawl_source(cfg: SourceConfig, fetcher: Fetcher, *, now: str, get_html=fetch_html) -> tuple[list[CatalogEntry], CrawlReport]:
    report = CrawlReport()
    follow = [re.compile(p, re.IGNORECASE) for p in cfg.follow]
    include = [re.compile(p, re.IGNORECASE) for p in cfg.include]
    exclude = [re.compile(p, re.IGNORECASE) for p in cfg.exclude]
    queue: deque[tuple[str, int]] = deque((s, 0) for s in cfg.seeds)
    seen_pages: set[str] = set()
    found: dict[str, CatalogEntry] = {}
    while queue and report.pages < cfg.max_pages:
        url, depth = queue.popleft()
        if url in seen_pages:
            continue
        seen_pages.add(url)
        try:
            html, final = get_html(fetcher, url, cfg.allowed_hosts)
        except FetchError as exc:
            report.errors.append(f"{url}: {exc}")
            continue
        report.pages += 1
        for link in extract_links(html, final):
            host = (urllib.parse.urlparse(link.href).hostname or "").lower()
            if not host_allowed(host, cfg.allowed_hosts) or not link.href.startswith("https://"):
                continue
            if is_pdf_url(link.href):
                hay = f"{link.text} {link.context} {link.href}"
                if include and not any(r.search(hay) for r in include):
                    continue
                if any(r.search(hay) for r in exclude):
                    continue
                report.pdf_links += 1
                if link.href in found:
                    continue
                meta = classify(link.href, link.text, link.context, cfg.exam)
                found[link.href] = CatalogEntry(
                    url=link.href, source=cfg.source, exam=cfg.exam, found_on=final, first_seen=now, last_seen=now,
                    paper_slug=paper_slug(cfg.exam, meta), **meta,  # type: ignore[arg-type]
                )
            elif (depth < cfg.max_depth and follow and any(r.search(link.href) for r in follow)
                  and link.href not in seen_pages):
                queue.append((link.href, depth + 1))
    return list(found.values()), report


def merge(catalog: Catalog, entries: list[CatalogEntry], now: str) -> tuple[int, int]:
    """Add new entries, refresh last_seen on known ones (first_seen and manual edits are preserved)."""
    added = updated = 0
    for e in entries:
        old = catalog.entries.get(e.url)
        if old is None:
            catalog.entries[e.url] = e
            added += 1
        else:
            old.last_seen = now
            updated += 1
    catalog.generated_at = now
    catalog.entries = dict(sorted(catalog.entries.items(), key=lambda kv: (kv[1].exam, -(kv[1].year or 0), kv[0])))
    return added, updated


def to_manifest(catalog: Catalog, sources: SourcesFile, *, since: str | None = None) -> dict[str, object]:
    """Fetch manifest (pxw ingest fetch) for papers and keys; `since` limits it to newly discovered ones."""
    hosts = {s.source: s.allowed_hosts for s in sources.sources}
    out = []
    for e in catalog.entries.values():
        if e.kind == "OTHER" or not e.year or not e.paper_slug:
            continue
        if since and e.first_seen < since:
            continue
        item: dict[str, object] = {"source": e.source, "url": e.url, "kind": e.kind, "paper_slug": e.paper_slug,
                                   "paper_title": e.title, "year": e.year, "exam": e.exam}
        if e.exam_date:
            item["exam_date"] = e.exam_date
        if e.shift:
            item["shift"] = e.shift
        out.append(item)
    used = sorted({str(i["source"]) for i in out})
    return {"allowed_hosts": {s: hosts[s] for s in used if s in hosts}, "entries": out}


def run(sources_path: Path, catalog_path: Path, manifest_out: Path | None, *, only: list[str] | None = None,
        fetcher: Fetcher | None = None) -> dict[str, object]:
    sources = SourcesFile.model_validate_json(sources_path.read_text(encoding="utf-8"))
    catalog = Catalog.model_validate_json(catalog_path.read_text(encoding="utf-8")) if catalog_path.exists() else Catalog()
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    fetcher = fetcher or Fetcher(user_agent=sources.user_agent or DEFAULT_USER_AGENT, min_interval_s=sources.min_interval_s)
    summary: dict[str, object] = {"event": "discover_done", "at": now, "sources": {}}
    for cfg in sources.sources:
        if not cfg.enabled or (only and cfg.source not in only):
            continue
        t0 = time.monotonic()
        entries, rep = crawl_source(cfg, fetcher, now=now)
        added, updated = merge(catalog, entries, now)
        summary["sources"][f"{cfg.source}:{cfg.exam}"] = {  # type: ignore[index]
            "pages": rep.pages, "pdf_links": rep.pdf_links, "added": added, "seen_again": updated,
            "errors": rep.errors, "seconds": round(time.monotonic() - t0, 1),
        }
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(catalog.model_dump_json(indent=2, exclude_none=True) + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for e in catalog.entries.values():
        counts[f"{e.exam}:{e.kind}"] = counts.get(f"{e.exam}:{e.kind}", 0) + 1
    summary["catalog_counts"] = dict(sorted(counts.items()))
    if manifest_out:
        manifest_out.parent.mkdir(parents=True, exist_ok=True)
        manifest_out.write_text(json.dumps(to_manifest(catalog, sources), indent=2) + "\n", encoding="utf-8")
    return summary


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="pxw-discover", description=__doc__.split("\n")[0])
    ap.add_argument("--sources", required=True)
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--manifest-out", default=None)
    ap.add_argument("--only", default="", help="comma-separated source codes")
    a = ap.parse_args(argv)
    only = [s.strip() for s in a.only.split(",") if s.strip()] or None
    summary = run(Path(a.sources), Path(a.catalog), Path(a.manifest_out) if a.manifest_out else None, only=only)
    print(json.dumps(summary, indent=2))
    errors = sum(len(v["errors"]) for v in summary["sources"].values())  # type: ignore[union-attr]
    pages = sum(v["pages"] for v in summary["sources"].values())  # type: ignore[union-attr]
    return 1 if pages == 0 and errors else 0


if __name__ == "__main__":
    sys.exit(main())
