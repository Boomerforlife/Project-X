"""Generic numbered layout: `1.` / `1)` / `Q1.` questions (sequential), options `(A)`/`(1)`/`A.`/`A)`."""

from __future__ import annotations

import re

from pxw.extraction.segment import ProfileSpec

SPEC = ProfileSpec(
    name="generic_numbered",
    q_start=re.compile(r"^\s*(?:Q\.?\s*)?(?P<num>\d{1,3})\s*[.)]\s+(?P<rest>.*)$"),
    q_explicit=False,  # numbers must be sequential so that "2. foo" inside a stem is not a new question
    qid_re=re.compile(r"^\s*Question\s*ID\s*[:\-]?\s*(\d{6,14})\b", re.IGNORECASE),
    opt_id_re=re.compile(r"^\s*Option\s*(\d)\s*ID\s*[:\-]?\s*(\d{6,14})\b", re.IGNORECASE),
    # digits only inside parentheses (a bare `1.` would collide with question numbering)
    opt_line_re=re.compile(r"^\s*(?:\((?P<label>[A-Ea-e1-5])\)|(?P<alt>[A-Ea-e])[.)])\s*(?P<rest>.*)$"),
    opt_inline_re=re.compile(r"(?:(?<=\s)|^)\((?P<label>[A-Ea-e1-5])\)\s*"),
    meta_drop_re=re.compile(r"^\s*(Status|Chosen\s+Option)\b", re.IGNORECASE),
)
