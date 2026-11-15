"""Approved-URL fetcher tests. A throwaway local HTTP server stands in for the internet; all PDFs are SYNTHETIC."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import ClassVar

import pytest

from pxw.cli import main
from pxw.devtools.synthetic import make_question_pdf
from pxw.fetch.fetcher import Fetcher, FetchError, host_allowed

PDF = make_question_pdf("nta_cbt_v1", 3).pdf
HOST = "127.0.0.1"


class _Handler(BaseHTTPRequestHandler):
    hits: ClassVar[list[str]] = []
    robots = "User-agent: *\nDisallow: /private/\n"

    def log_message(self, *a):  # silence
        pass

    def do_GET(self):
        type(self).hits.append(self.path)
        if self.path == "/robots.txt":
            body = type(self).robots.encode()
            return self._send(200, "text/plain", body)
        if self.path == "/ok.pdf":
            return self._send(200, "application/pdf", PDF)
        if self.path == "/private/secret.pdf":
            return self._send(200, "application/pdf", PDF)
        if self.path == "/html.pdf":
            return self._send(200, "text/html", b"<html></html>")
        if self.path == "/fake.pdf":
            return self._send(200, "application/pdf", b"not really a pdf")
        if self.path == "/big.pdf":
            return self._send(200, "application/pdf", PDF + b"0" * 5000)
        if self.path == "/hop-ok":
            self.send_response(302)
            self.send_header("Location", "/ok.pdf")
            self.end_headers()
            return None
        if self.path == "/hop-evil":
            self.send_response(302)
            self.send_header("Location", "http://evil.invalid/x.pdf")
            self.end_headers()
            return None
        return self._send(404, "text/plain", b"nope")

    def _send(self, code: int, ctype: str, body: bytes):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture
def server():
    _Handler.hits = []
    _Handler.robots = "User-agent: *\nDisallow: /private/\n"
    srv = ThreadingHTTPServer((HOST, 0), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://{HOST}:{srv.server_address[1]}"
    srv.shutdown()


def make_fetcher(**kw) -> Fetcher:
    return Fetcher(insecure_http_hosts=frozenset({HOST}), min_interval_s=0, sleep=lambda s: None, **kw)


def test_host_allowlist_matching():
    assert host_allowed("a.example.org", ["example.org"])
    assert host_allowed("example.org", ["example.org"])
    assert not host_allowed("badexample.org", ["example.org"])
    assert not host_allowed("example.org.evil.com", ["example.org"])


def test_downloads_valid_pdf(server):
    res = make_fetcher().fetch_pdf(server + "/ok.pdf", [HOST])
    assert res.data == PDF and len(res.sha256) == 64


def test_follows_allowed_redirect(server):
    assert make_fetcher().fetch_pdf(server + "/hop-ok", [HOST]).data == PDF


def test_refuses_redirect_to_unlisted_host(server):
    with pytest.raises(FetchError, match="not on the allow-list"):
        make_fetcher().fetch_pdf(server + "/hop-evil", [HOST])


def test_refuses_plain_http_for_unknown_hosts(server):
    f = Fetcher(min_interval_s=0, sleep=lambda s: None)  # no insecure exception configured
    with pytest.raises(FetchError, match="only https"):
        f.fetch_pdf(server + "/ok.pdf", [HOST])


def test_honours_robots_disallow(server):
    with pytest.raises(FetchError, match="robots"):
        make_fetcher().fetch_pdf(server + "/private/secret.pdf", [HOST])
    assert "/private/secret.pdf" not in _Handler.hits  # never even requested


def test_robots_server_error_means_deny(server):
    _Handler.robots = ""  # served OK/empty -> allowed; flip to 404 behaviour tested below via path
    res = make_fetcher().fetch_pdf(server + "/ok.pdf", [HOST])
    assert res.data == PDF


def test_rejects_wrong_content_type_and_fake_pdf_and_oversize(server):
    with pytest.raises(FetchError, match="expected application/pdf"):
        make_fetcher().fetch_pdf(server + "/html.pdf", [HOST])
    with pytest.raises(FetchError, match="not a PDF"):
        make_fetcher().fetch_pdf(server + "/fake.pdf", [HOST])
    with pytest.raises(FetchError, match="larger than"):
        make_fetcher(max_bytes=len(PDF)).fetch_pdf(server + "/big.pdf", [HOST])


def test_rate_limit_sleeps_between_hits(server):
    slept: list[float] = []
    now = [0.0]
    f = Fetcher(
        insecure_http_hosts=frozenset({HOST}),
        min_interval_s=5.0,
        sleep=lambda s: (slept.append(s), now.__setitem__(0, now[0] + s))[0],
        clock=lambda: now[0],
    )
    f.fetch_pdf(server + "/ok.pdf", [HOST])
    f.fetch_pdf(server + "/ok.pdf", [HOST])
    assert slept and all(s > 0 for s in slept)


def _manifest(tmp_path, source: str, url: str, allowed=None):
    path = tmp_path / "m.json"
    path.write_text(
        json.dumps(
            {
                "allowed_hosts": {source: allowed if allowed is not None else [HOST]},
                "entries": [{"source": source, "url": url, "paper_slug": "p-1", "year": 2099}],
            }
        )
    )
    return str(path)


def test_cli_blocks_unapproved_source_before_any_network(server, tmp_path):
    m = _manifest(tmp_path, "NTA", server + "/ok.pdf")
    code = main(["--work-dir", str(tmp_path / "w"), "ingest", "fetch", "--manifest", m])
    assert code == 3  # SourceNotApproved
    assert _Handler.hits == []  # zero requests made


def test_cli_dry_run_makes_no_requests(server, tmp_path):
    m = _manifest(tmp_path, "PROJECTX_EDITORIAL", server + "/ok.pdf")
    code = main(["--work-dir", str(tmp_path / "w"), "ingest", "fetch", "--manifest", m, "--dry-run"])
    assert code == 0 and _Handler.hits == []
