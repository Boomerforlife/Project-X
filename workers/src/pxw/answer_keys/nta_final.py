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
            cells = [
                w for w in words if QID.match(w[4]) or NUMBER.match(w[4]) or MULTI_ID.match(w[4]) or DROPPED.match(w[4])
            ]
            # Group into rows by vertical centre.
            cells.sort(key=lambda w: ((w[1] + w[3]) / 2, w[0]))
            row: list[Any] = []
            grouped: list[list[Any]] = []
            for w in cells:
                cy = (w[1] + w[3]) / 2
                if row and abs(cy - (row[0][1] + row[0][3]) / 2) > 3:
                    grouped.append(row)
                    row = []
                row.append(w)
            if row:
                grouped.append(row)
            for r in grouped:
                r.sort(key=lambda w: w[0])
                for i in range(0, len(r) - 1, 2):
                    qid, ans = r[i][4], r[i + 1][4]
                    if not QID.match(qid):
                        continue
                    y = (r[i][1] + r[i][3]) / 2
                    subj = next((s for sy, s in reversed(subjects) if sy <= y), None)
                    rows.append(KeyRow(date, shift, subj, qid, ans))
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
    if len(parts) == 1 and NUMBER.match(parts[0]):
        return {"kind": "NUMERIC", "accepted_ranges": [{"min": parts[0], "max": parts[0]}]}
    return {"kind": "DROPPED"}  # unreadable: never guess an answer


def paper_slug(exam: str, exam_date: str, shift: int) -> str:
    """Same convention as workers/manifests: jee-main-2026-04-02-shift-1."""
    return f"{exam}-{exam_date}-shift-{shift}"
