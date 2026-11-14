r"""Dedupe-form text (INGESTION_PIPELINE section 6).

NFKC -> lowercase -> LaTeX commands kept as tokens (\frac) -> whitespace runs collapsed to one space ->
punctuation stripped except `+-*/=^()[]{}<>.,`. Question text + " || " + options joined by " | " in label order.
"""

from __future__ import annotations

import re
import unicodedata

from pxw.common.hashing import sha256_hex

_KEEP = set("+-*/=^()[]{}<>.,")
_CMD = re.compile(r"\\[a-z]+")


def normalize_text(s: str) -> str:
    s = unicodedata.normalize("NFKC", s).lower()
    out: list[str] = []
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "\\":
            m = _CMD.match(s, i)
            if m:
                out.append(" " + m.group() + " ")  # command stays a separate token
                i = m.end()
                continue
            i += 1
            continue
        if ch.isalnum() or ch in _KEEP:
            out.append(ch)
        elif ch.isspace():
            out.append(" ")
        i += 1
    return re.sub(r"\s+", " ", "".join(out)).strip()


def build_normalized_text(question_text: str, options: list[tuple[str, str]]) -> str:
    """options: [(label, option_text)] -- sorted by label here."""
    opts = " | ".join(normalize_text(t) for _, t in sorted(options, key=lambda o: o[0]))
    return normalize_text(question_text) + " || " + opts


def content_hash(normalized_text: str) -> str:
    return sha256_hex(normalized_text)
