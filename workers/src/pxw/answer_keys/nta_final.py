"""NTA 'Final Answer Key' PDFs (JEE Main CBT): QUESTION ID -> CORRECT OPTION ID tables, per exam date and shift.

Layout (2025-2026): each page starts with "Exam Date : 02.04.2026", "Exam Shift : First|Second", then subject headings
"( MATHEMATICS )" and a table with up to three QUESTION ID / CORRECT OPTION ID column pairs per row. The answer cell is
an option id for MCQs (several ids if more than one option was accepted), a number for numerical questions, or a word
such as "Drop" / "Bonus" when the question was dropped.

Parsing is positional (words grouped into rows by y, cells paired left to right) so it doesn't depend on the order in
which the PDF text layer lists the three columns.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DATE = re.compile(r"Exam Date\s*:\s*(\d{2})\.(\d{2})\.(\d{4})")
SHIFT = re.compile(r"Exam Shift\s*:\s*(First|Second|1|2)", re.IGNORECASE)
SUBJECT = re.compile(r"\(\s*(MATHEMATICS|PHYSICS|CHEMISTRY)\s*\)", re.IGNORECASE)
QID = re.compile(r"^\d{6,14}$")
NUMBER = re.compile(r"^-?\d+(\.\d+)?$")
MULTI_ID = re.compile(r"^\d{6,14}(,\s*\d{6,14})+,?$")  # more than one accepted option
DROPPED = re.compile(r"^(drop|dropped|bonus|deleted|cancel)", re.IGNORECASE)


@dataclass
class KeyRow:
    exam_date: str  # YYYY-MM-DD
    shift: int
    subject: str | None
    external_question_id: str
    raw_answer: str


def _shift(v: str) -> int:
    return 1 if v.lower() in {"first", "1"} else 2


def parse_nta_final_key(pdf_path: str | Path) -> list[KeyRow]:
    import pymupdf

    rows: list[KeyRow] = []
    last_cols: list[tuple[float, float]] = []
    with pymupdf.open(str(pdf_path)) as doc:
        for page in doc:
            text = page.get_text("text")
            m_date = DATE.search(text)
            m_shift = SHIFT.search(text)
            if not (m_date and m_shift):
                continue
            date = f"{m_date.group(3)}-{m_date.group(2)}-{m_date.group(1)}"
            shift = _shift(m_shift.group(1))
            # Subject headings with their y position, so each cell takes the nearest heading above it.
            subjects: list[tuple[float, str]] = []
            for b in page.get_text("dict")["blocks"]:
                for ln in b.get("lines", []):
                    t = "".join(s["text"] for s in ln["spans"])
                    m = SUBJECT.search(t)
                    if m:
                        subjects.append((ln["bbox"][1], m.group(1).upper()))
            subjects.sort()
            words = page.get_text("words")  # x0, y0, x1, y1, word, block, line, wordno
            # Column layout from the headers: "QUESTION ID" starts each id column, "CORRECT OPTION ID" each answer column.
            # Every answer is read from its own column, whatever it contains (an id, a number, or words such as
            # "Any non-negative Integer"), so one unusual cell can never shift the pairs that follow it.
            # Only the header row counts: the 2021 keys also print "QUESTION" in their footer.
            correct_y = [w[1] for w in words if w[4].upper() == "CORRECT"]
            header_y = min(correct_y) if correct_y else None
            def in_header(w: Any, hy: float | None = header_y) -> bool:
                return hy is not None and abs(w[1] - hy) < 6
            qcols = sorted(w[0] for w in words if w[4].upper() == "QUESTION" and in_header(w))
            acols = sorted(w[0] for w in words if w[4].upper() == "CORRECT" and in_header(w))
            if qcols and len(qcols) == len(acols):
                cols = list(zip(qcols, acols, strict=True))
            elif last_cols:
                cols = last_cols
            else:
                continue
            last_cols = cols
            header_bottom = max((w[3] for w in words if w[4].upper() in {"QUESTION", "CORRECT"} and in_header(w)), default=0.0)
            body = sorted((w for w in words if w[1] >= header_bottom - 1), key=lambda w: ((w[1] + w[3]) / 2, w[0]))
            grouped: list[list[Any]] = []
            for w in body:
                cy = (w[1] + w[3]) / 2
                if grouped and abs(cy - (grouped[-1][0][1] + grouped[-1][0][3]) / 2) <= 3:
                    grouped[-1].append(w)
                else:
                    grouped.append([w])
            for r in grouped:
                for k, (qx, ax) in enumerate(cols):
                    nxt = cols[k + 1][0] if k + 1 < len(cols) else float("inf")
                    qid_words = [w for w in r if qx - 15 <= w[0] < ax - 5 and QID.match(w[4])]
                    ans_words = sorted((w for w in r if ax - 15 <= w[0] < nxt - 15), key=lambda w: w[0])
                    if len(qid_words) != 1 or not ans_words:
                        continue
                    y = (qid_words[0][1] + qid_words[0][3]) / 2
                    subj = next((s for sy, s in reversed(subjects) if sy <= y), None)
                    rows.append(KeyRow(date, shift, subj, qid_words[0][4], " ".join(w[4] for w in ans_words)))
    return rows


def normalize_answer(raw: str, option_ids: set[str] | None) -> dict[str, Any]:
    """Map a raw cell to the OfficialAnswer shape used by link_official_answer_keys."""
    parts = [p for p in re.split(r"[,\s/]+", raw.strip()) if p]
    if not parts or DROPPED.match(parts[0]):
        return {"kind": "DROPPED"}
    if option_ids is not None:
        # Multiple-choice: only this question's own option ids count; anything else is unreadable, never a number.
        if all(p in option_ids for p in parts):
            return {"kind": "EXTERNAL_OPTION_IDS", "ids": parts}
        return {"kind": "DROPPED"}
    values = [p for p in parts if p.lower() not in {"or", "and"}]
    if values and all(NUMBER.match(v) for v in values):
        # "41 or 42": every listed value is accepted.
        return {"kind": "NUMERIC", "accepted_ranges": [{"min": v, "max": v} for v in values]}
    return {"kind": "DROPPED"}  # unreadable: never guess an answer


def paper_slug(exam: str, exam_date: str, shift: int) -> str:
    """Same convention as workers/manifests: jee-main-2026-04-02-shift-1."""
    return f"{exam}-{exam_date}-shift-{shift}"
