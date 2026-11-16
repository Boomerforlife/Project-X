"""Answers printed by the exam board inside its own question-paper booklet (JEE Advanced archive).

Formats seen: "C", "(C)", "A, C", "(A), (C)", "6", "[2.2 to 2.3]", "0.5 OR 0.75", "[75 to 79] OR [94 to 95]".
The result uses the OfficialAnswer shape understood by app_private.link_official_answer_keys. Anything that does not
fit the question's type is DROPPED, which sends the question to human review; an answer is never guessed.
"""

from __future__ import annotations

import re
from typing import Any

NUMBER = r"[-+−]?\d+(?:\.\d+)?"
RANGE = re.compile(rf"^\[?\s*({NUMBER})\s*(?:to|–|-{{1,2}}|—)\s*({NUMBER})\s*\]?$", re.IGNORECASE)
SINGLE_NUMBER = re.compile(rf"^\[?\s*({NUMBER})\s*\]?$")
LETTERS = re.compile(r"^[\s(]*([A-D])[\s)]*$")
DROPPED = re.compile(r"(drop|bonus|cancel|marks?\s+to\s+all|all\s+candidates)", re.IGNORECASE)


def _num(s: str) -> str:
    return s.replace("−", "-").lstrip("+")


def normalize_printed_answer(raw: str, question_type: str | None) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text or DROPPED.search(text):
        return {"kind": "DROPPED"}
    if question_type in ("SINGLE_MCQ", "MULTI_MCQ"):
        parts = [p for p in re.split(r"\s*(?:,|\band\b|&|\s)\s*", text) if p.strip("() ")]
        labels: list[str] = []
        for p in parts:
            m = LETTERS.match(p)
            if not m:
                return {"kind": "DROPPED"}
            if m.group(1) not in labels:
                labels.append(m.group(1))
        if not labels or (question_type == "SINGLE_MCQ" and len(labels) > 1 and len(labels) != 4):
            # Several letters on a single-answer question is only meaningful as "all accepted"; otherwise review it.
            return {"kind": "DROPPED"}
        return {"kind": "OPTION_LABELS", "labels": sorted(labels)}
    if question_type == "NUMERICAL":
        ranges = []
        for alt in re.split(r"\s+OR\s+|\s*;\s*", text, flags=re.IGNORECASE):
            alt = alt.strip()
            m = RANGE.match(alt)
            if m:
                lo, hi = sorted((float(_num(m.group(1))), float(_num(m.group(2)))))
                ranges.append({"min": _fmt(lo), "max": _fmt(hi)})
                continue
            m = SINGLE_NUMBER.match(alt)
            if m:
                v = _num(m.group(1))
                ranges.append({"min": v, "max": v})
                continue
            return {"kind": "DROPPED"}
        return {"kind": "NUMERIC", "accepted_ranges": ranges} if ranges else {"kind": "DROPPED"}
    return {"kind": "DROPPED"}


def _fmt(v: float) -> str:
    return str(int(v)) if v == int(v) else repr(v)
