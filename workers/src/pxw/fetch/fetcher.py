"""Approved-URL fetcher: downloads ONLY documents explicitly listed in a human-curated manifest.

This is deliberately NOT a crawler. Guard rails (all enforced here, before any bytes are kept):
  * the source must already be approved (checked by the caller before any network access);
  * https only, and the host (and every redirect hop) must be on the manifest's allow-list for that source;
  * robots.txt is honoured (a robots fetch error is treated as "deny");
  * polite per-host rate limit, hard size cap, timeout, bounded redirects;
  * the response must be a real PDF (Content-Type + %PDF magic).
"""

from __future__ import annotations

import hashlib
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

DEFAULT_USER_AGENT = "ProjectXIngest/1.0 (educational content ingestion; honours robots.txt)"
MAX_BYTES = 60 * 1024 * 1024
MAX_REDIRECTS = 3


class FetchError(Exception):
    """Raised for any refused or failed download. The message is safe to log."""


class ManifestEntry(BaseModel):
    source: str = Field(pattern=r"^[A-Z][A-Z0-9_]*$")
    url: str
    kind: Literal["QUESTION_PAPER", "ANSWER_KEY"] = "QUESTION_PAPER"
    paper_slug: str
    paper_title: str | None = None
    year: int = Field(ge=1978, le=2100)
    exam: str = "jee-main"
    session: str | None = None
    shift: int | None = None
    exam_date: str | None = None
    paper_code: str | None = None
    layout: str = "nta_cbt_v1"


class Manifest(BaseModel):
    """`allowed_hosts` maps a source code to the hostnames (and their subdomains) it may be fetched from."""

    allowed_hosts: dict[str, list[str]]
    entries: list[ManifestEntry]


@dataclass
class FetchResult:
    data: bytes
    sha256: str
    final_url: str
    content_type: str
    fetched_at: float = field(default_factory=time.time)


def host_allowed(host: str, allowed: list[str]) -> bool:
    host = host.lower().rstrip(".")
    return any(host == a.lower() or host.endswith("." + a.lower()) for a in allowed)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # type: ignore[no-untyped-def]
        return None  # we follow redirects manually so every hop is re-validated


class Fetcher:
    def __init__(
        self,
        *,
        user_agent: str = DEFAULT_USER_AGENT,
        timeout: float = 30.0,
        max_bytes: int = MAX_BYTES,
        min_interval_s: float = 5.0,
        insecure_http_hosts: frozenset[str] = frozenset(),  # tests only: allow http for these exact hosts
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.user_agent = user_agent
        self.timeout = timeout
        self.max_bytes = max_bytes
        self.min_interval_s = min_interval_s
        self.insecure_http_hosts = insecure_http_hosts
        self._sleep = sleep
        self._clock = clock
        self._last_hit: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._opener = urllib.request.build_opener(_NoRedirect)

    # -- guards ---------------------------------------------------------------------------------

    def _check_url(self, url: str, allowed: list[str]) -> urllib.parse.ParseResult:
        parts = urllib.parse.urlparse(url)
        host = (parts.hostname or "").lower()
        if not host or parts.username or parts.password:
            raise FetchError("refused: URL must have a plain hostname and no credentials")
        if not host_allowed(host, allowed):
            raise FetchError(f"refused: host {host!r} is not on the allow-list for this source")
        if parts.scheme != "https" and not (parts.scheme == "http" and host in self.insecure_http_hosts):
            raise FetchError(f"refused: only https URLs are allowed ({parts.scheme or 'no'} scheme)")
        return parts

    def _throttle(self, host: str) -> None:
        last = self._last_hit.get(host)
        if last is not None:
            wait = self.min_interval_s - (self._clock() - last)
            if wait > 0:
                self._sleep(wait)
        self._last_hit[host] = self._clock()

    def _robots_ok(self, parts: urllib.parse.ParseResult, url: str) -> bool:
        base = f"{parts.scheme}://{parts.netloc}"
        if base not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                self._throttle(parts.hostname or "")
                req = urllib.request.Request(base + "/robots.txt", headers={"User-Agent": self.user_agent})
                with self._opener.open(req, timeout=self.timeout) as resp:
                    rp.parse(resp.read(512 * 1024).decode("utf-8", "replace").splitlines())
                self._robots[base] = rp
            except urllib.error.HTTPError as exc:
                if exc.code in (404, 410):
                    self._robots[base] = None  # no robots.txt = nothing disallowed
                else:
                    raise FetchError(f"refused: robots.txt returned HTTP {exc.code}") from exc
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                raise FetchError(f"refused: could not read robots.txt ({exc})") from exc
        rp = self._robots[base]
        return True if rp is None else rp.can_fetch(self.user_agent, url)

    # -- download -------------------------------------------------------------------------------

    def fetch_pdf(self, url: str, allowed_hosts: list[str]) -> FetchResult:
        current = url
        for _hop in range(MAX_REDIRECTS + 1):
            parts = self._check_url(current, allowed_hosts)
            if not self._robots_ok(parts, current):
                raise FetchError("refused: disallowed by robots.txt")
            self._throttle(parts.hostname or "")
            req = urllib.request.Request(current, headers={"User-Agent": self.user_agent, "Accept": "application/pdf"})
            try:
                resp = self._opener.open(req, timeout=self.timeout)
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
                ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                if ctype != "application/pdf":
                    raise FetchError(f"refused: expected application/pdf, got {ctype or 'no content type'}")
                declared = resp.headers.get("Content-Length")
                if declared and declared.isdigit() and int(declared) > self.max_bytes:
                    raise FetchError(f"refused: file larger than {self.max_bytes} bytes")
                buf = bytearray()
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    buf += chunk
                    if len(buf) > self.max_bytes:
                        raise FetchError(f"refused: file larger than {self.max_bytes} bytes")
            data = bytes(buf)
            if not data.startswith(b"%PDF"):
                raise FetchError("refused: response is not a PDF (missing %PDF header)")
            return FetchResult(data, hashlib.sha256(data).hexdigest(), current, ctype)
        raise FetchError(f"refused: more than {MAX_REDIRECTS} redirects")


def save_download(result: FetchResult, downloads_dir: Path, entry_url: str) -> Path:
    """Write the PDF (named by its hash) plus a provenance sidecar next to it."""
    import json

    downloads_dir.mkdir(parents=True, exist_ok=True)
    pdf = downloads_dir / f"{result.sha256}.pdf"
    if not pdf.exists():
        pdf.write_bytes(result.data)
    (downloads_dir / f"{result.sha256}.json").write_text(
        json.dumps(
            {
                "requested_url": entry_url,
                "final_url": result.final_url,
                "fetched_at": result.fetched_at,
                "sha256": result.sha256,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return pdf
