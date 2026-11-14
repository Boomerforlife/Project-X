"""NTA CBT layout: `Q.n` questions, `Question ID : n`, `Option k ID : n`, options (1)..(4) / (A)..(D) / `1.`."""

from __future__ import annotations

import re

from pxw.extraction.segment import ProfileSpec

SPEC = ProfileSpec(
    name="nta_cbt_v1",
    q_start=re.compile(r"^\s*Q\.?\s*(?P<num>\d{1,3})\b\s*[.):\-]?\s*(?P<rest>.*)$"),
    q_explicit=True,
    qid_re=re.compile(r"^\s*Question\s*ID\s*[:\-]?\s*(\d{6,14})\b", re.IGNORECASE),
    opt_id_re=re.compile(r"^\s*Option\s*(\d)\s*ID\s*[:\-]?\s*(\d{6,14})\b", re.IGNORECASE),
    opt_line_re=re.compile(r"^\s*\(?(?P<label>[A-Ea-e1-5])[.)]\s*(?P<rest>.*)$"),
    opt_inline_re=re.compile(r"(?:(?<=\s)|^)\((?P<label>[A-Ea-e1-5])\)\s*"),
    meta_drop_re=re.compile(r"^\s*(Status|Chosen\s+Option|Question\s+Type)\b", re.IGNORECASE),
)
