"""Official answer-key parser (INGESTION_PIPELINE section 7).

Rows `(question id or number, answer)` -> OfficialAnswer:
  option IDs (8-12 digits)        -> {"kind": "EXTERNAL_OPTION_IDS", "ids": [...]}
  1..4 / A..D (1 -> A), `1,3`     -> {"kind": "OPTION_LABELS", "labels": [...]}
  2.5 / 2.4 to 2.6 / 2.4-2.6      -> {"kind": "NUMERIC", "accepted_ranges": [{"min","max"}]}
  Drop / Bonus                    -> {"kind": "DROPPED"}
A lone digit 1-4 is read as an option label (a numerical answer of 1..4 is indistinguishable without the question).
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

ID_RE = re.compile(r"(?<!\d)\d{8,12}(?!\d)")
_NUM = r"-?\d+(?:\.\d+)?"
_LABELS_RE = re.compile(r"^[A-Da-d1-4](?:\s*(?:,|;|&|/|\band\b|\bor\b)\s*[A-Da-d1-4])*$", re.IGNORECASE)
_RANGE_RE = re.compile(rf"^({_NUM})\s*(?:to|-|–|—)\s*({_NUM})$", re.IGNORECASE)
_NUM_RE = re.compile(rf"^{_NUM}$")
_DROP_RE = re.compile(r"^(drop(?:ped)?|bonus|deleted|cancel(?:l)?ed|grace)$", re.IGNORECASE)
_PAIR = r"(?:Q\.?\s*)?(\d{1,3})\s*[.:)\-]?\s+([A-Da-d1-4](?:\s*,\s*[A-Da-d1-4])*|Drop(?:ped)?|Bonus)(?=\s|$)"
_PAIRS_RE = re.compile(rf"^\s*(?:{_PAIR}\s*){{2,}}$", re.IGNORECASE)
_PAIR_ITER = re.compile(_PAIR, re.IGNORECASE)
_NUM_LED = re.compile(r"^\s*(?:Q\.?\s*)?(\d{1,3})(?!\d)(?:[\s.:)|,]|-(?=[\sA-Za-z]))*(.*)$", re.IGNORECASE)
_ID_LED = re.compile(r"^\s*(\d{8,12})(?!\d)[\s|,:\-]*(.*)$")


def parse_answer(raw: str) -> dict[str, Any] | None:
    r = raw.strip().strip("|").strip()
    if not r:
        return None
    if _DROP_RE.match(r):
        return {"kind": "DROPPED"}
    ids = ID_RE.findall(r)
    if ids:
        rest = ID_RE.sub("", r)
        if re.fullmatch(r"[\s,;/&|]*(?:(?:and|or)[\s,;/&|]*)*", rest, re.IGNORECASE):
            return {"kind": "EXTERNAL_OPTION_IDS", "ids": ids}
        return None
    if _LABELS_RE.match(r):
        labels: list[str] = []
        for tok in re.findall(r"[A-Da-d1-4]", r):
            lab = "ABCD"[int(tok) - 1] if tok.isdigit() else tok.upper()
            if lab not in labels:
                labels.append(lab)
        return {"kind": "OPTION_LABELS", "labels": labels}
    m = _RANGE_RE.match(r)
    if m:
        lo, hi = m.group(1), m.group(2)
        if float(lo) > float(hi):
            lo, hi = hi, lo
        return {"kind": "NUMERIC", "accepted_ranges": [{"min": lo, "max": hi}]}
    if _NUM_RE.match(r):
        return {"kind": "NUMERIC", "accepted_ranges": [{"min": r, "max": r}]}
    return None


def _row(qnum: str | None, qid: str | None, raw: str) -> dict[str, Any] | None:
    norm = parse_answer(raw)
    if norm is None:
        return None
    return {
        "question_number": qnum,
        "external_question_id": qid,
        "raw_answer": raw.strip(),
        "normalized_answer": norm,
        "is_dropped": norm["kind"] == "DROPPED",
    }


def parse_key_lines(lines: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    """Returns (rows, unparsed_lines). Lines without a leading question number/id (headers, titles) are ignored."""
    rows: list[dict[str, Any]] = []
    unparsed: list[str] = []
    seen: set[tuple[str | None, str | None]] = set()

    def add(row: dict[str, Any] | None, line: str) -> None:
        if row is None:
            unparsed.append(line)
            return
        k = (row["question_number"], row["external_question_id"])
        if k in seen:  # first occurrence wins; the repeat is reported
            unparsed.append(line)
            return
        seen.add(k)
        rows.append(row)

    for line in lines:
        s = " ".join(line.split())
        if not s or not any(c.isdigit() for c in s):
            continue
        if _PAIRS_RE.match(s):
            nums = [int(m.group(1)) for m in _PAIR_ITER.finditer(s)]
            if nums == sorted(nums):
                for m in _PAIR_ITER.finditer(s):
                    add(_row(m.group(1), None, m.group(2)), f"{m.group(1)} {m.group(2)}")
                continue
        m_id = _ID_LED.match(s)
        if m_id:
            if not m_id.group(2).strip():
                unparsed.append(s)
                continue
            add(_row(None, m_id.group(1), m_id.group(2)), s)
            continue
        m_num = _NUM_LED.match(s)
        if not m_num:
            continue  # header / title / footer
        qnum, rest = m_num.group(1), m_num.group(2).strip()
        if not rest:
            unparsed.append(s)
            continue
        ids = ID_RE.findall(rest)
        if len(ids) >= 2:  # `n  <question id>  <option id>[, <option id>]`
            qid = ids[0]
            tail = rest.replace(qid, "", 1)
            add(_row(qnum, qid, tail), s)
            continue
        add(_row(qnum, None, rest), s)
    return rows, unparsed


def extract_key_lines(pdf_path: str | Path) -> list[str]:
    """PyMuPDF words grouped into visual rows (same y within 3pt), left to right."""
    import pymupdf

    out: list[str] = []
    doc = pymupdf.open(str(pdf_path))
    try:
        for page in doc:
            words = sorted(page.get_text("words"), key=lambda w: ((w[1] + w[3]) / 2, w[0]))
            row: list[Any] = []
            row_y = None
            for w in words:
                cy = (w[1] + w[3]) / 2
                if row_y is None or abs(cy - row_y) <= 3:
                    row.append(w)
                    row_y = cy if row_y is None else row_y
                else:
                    out.append(" ".join(x[4] for x in sorted(row, key=lambda x: x[0])))
                    row, row_y = [w], cy
            if row:
                out.append(" ".join(x[4] for x in sorted(row, key=lambda x: x[0])))
    finally:
        doc.close()
    return out
