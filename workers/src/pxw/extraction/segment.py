"""Question/option segmentation driven by a layout profile (regex spec)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

LABELS = "ABCDE"
_SUBJECTS = {"physics": "PHYSICS", "chemistry": "CHEMISTRY", "mathematics": "MATHEMATICS", "maths": "MATHEMATICS"}


@dataclass
class ProfileSpec:
    name: str
    q_start: re.Pattern[str]  # groups: (number, rest) -- named: num, rest
    q_explicit: bool  # True: any number accepted; False: must be last+1 (or first question)
    qid_re: re.Pattern[str]
    opt_id_re: re.Pattern[str]
    opt_line_re: re.Pattern[str]  # option marker at line start: groups label, rest
    opt_inline_re: re.Pattern[str]  # inline "(B)" markers: group label
    meta_drop_re: re.Pattern[str]
    numerical_hint_re: re.Pattern[str] = field(default_factory=lambda: re.compile(r"given\s+answer", re.IGNORECASE))
    section_subject_re: re.Pattern[str] = field(
        default_factory=lambda: re.compile(
            r"^\s*(?:section\s*[:\-]\s*)?(physics|chemistry|mathematics|maths)\b"
            r"(?:\s*[-:(]?\s*section\s*([ab]))?\s*\)?\s*$",
            re.IGNORECASE,
        )
    )
    section_letter_re: re.Pattern[str] = field(
        default_factory=lambda: re.compile(r"^\s*section\s*[:\-]?\s*([ab])\b(.*)$", re.IGNORECASE)
    )


def canon_label(raw: str) -> str:
    raw = raw.strip().upper()
    if raw.isdigit():
        return LABELS[int(raw) - 1]
    return raw


@dataclass
class _Q:
    number: str
    section: str | None
    numerical_mode: bool | None
    lines: list[dict[str, Any]] = field(default_factory=list)
    stem: list[str] = field(default_factory=list)
    options: list[dict[str, Any]] = field(default_factory=list)
    external_question_id: str | None = None
    option_ids: dict[str, str] = field(default_factory=dict)
    given_answer_hint: bool = False
    start_page: int = 0
    start_y: float = 0.0


def _expected(q: _Q) -> str | None:
    n = len(q.options)
    return LABELS[n] if n < len(LABELS) else None


def _split_inline(text: str, spec: ProfileSpec, expected: str | None) -> tuple[str, list[tuple[str, str]]]:
    """Split a line on inline option markers that follow the expected label sequence."""
    if expected is None:
        return text, []
    marks: list[tuple[int, int, str]] = []
    exp = LABELS.index(expected)
    for m in spec.opt_inline_re.finditer(text):
        lab = canon_label(m.group("label"))
        if exp < len(LABELS) and lab == LABELS[exp]:
            marks.append((m.start(), m.end(), lab))
            exp += 1
    if not marks:
        return text, []
    prefix = text[: marks[0][0]].strip()
    parts: list[tuple[str, str]] = []
    for i, (_, end, lab) in enumerate(marks):
        stop = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        parts.append((lab, text[end:stop].strip()))
    return prefix, parts


def strip_headers_footers(
    lines: list[dict[str, Any]], page_count: int, heights: dict[int, float] | None = None
) -> list[dict[str, Any]]:
    """Drop `Page N [of M]` lines and header/footer-band lines that repeat (digits normalised) on >= 50% of pages."""
    page_re = re.compile(r"^\s*page\s*\d+(\s*(of|/)\s*\d+)?\s*$", re.IGNORECASE)
    lines = [ln for ln in lines if not page_re.match(ln["text"])]
    if page_count < 2 or not heights:
        return lines

    def in_band(ln: dict[str, Any]) -> bool:
        h = heights.get(ln["page"], 842.0)
        return ln["bbox"][1] < 0.08 * h or ln["bbox"][3] > 0.92 * h

    def norm(ln: dict[str, Any]) -> str:
        return re.sub(r"\d+", "#", ln["text"].strip().lower())

    seen: dict[str, set[int]] = {}
    for ln in lines:
        if in_band(ln):
            seen.setdefault(norm(ln), set()).add(ln["page"])
    repeated = {k for k, v in seen.items() if len(v) >= max(2, page_count * 0.5) and len(k) < 120}
    return [ln for ln in lines if not (in_band(ln) and norm(ln) in repeated)]


def segment_lines(lines: list[dict[str, Any]], spec: ProfileSpec) -> list[dict[str, Any]]:
    section: str | None = None
    numerical_mode: bool | None = None
    questions: list[_Q] = []
    cur: _Q | None = None
    last_num: int | None = None

    for ln in lines:
        text = ln["text"].strip()
        if not text:
            continue
        ms = spec.section_subject_re.match(text)
        if ms:
            section = _SUBJECTS[ms.group(1).lower()]
            numerical_mode = True if (ms.group(2) or "").lower() == "b" else (False if ms.group(2) else None)
            continue
        ml = spec.section_letter_re.match(text)
        if ml and len(text) < 80:
            rest = ml.group(2).lower()
            if re.search(r"numerical|integer|\bsa\b", rest):
                numerical_mode = True
            elif re.search(r"mcq|single|multiple", rest):
                numerical_mode = False
            else:
                numerical_mode = ml.group(1).lower() == "b"
            continue

        mq = spec.q_start.match(text)
        if mq:
            num = int(mq.group("num"))
            if spec.q_explicit or last_num is None or num == last_num + 1:
                cur = _Q(mq.group("num"), section, numerical_mode, start_page=ln["page"], start_y=ln["bbox"][1])
                questions.append(cur)
                last_num = num
                cur.lines.append(ln)
                rest = mq.group("rest").strip()
                if rest:
                    cur.stem.append(rest)
                continue
        if cur is None:
            continue

        mid = spec.qid_re.match(text)
        if mid:
            cur.external_question_id = mid.group(1)
            cur.lines.append(ln)
            continue
        moi = spec.opt_id_re.match(text)
        if moi:
            cur.option_ids[canon_label(moi.group(1))] = moi.group(2)
            cur.lines.append(ln)
            continue
        if spec.numerical_hint_re.search(text):
            cur.given_answer_hint = True
            cur.lines.append(ln)
            continue
        if spec.meta_drop_re.match(text):
            cur.lines.append(ln)
            continue

        cur.lines.append(ln)
        expected = _expected(cur)
        mo = spec.opt_line_re.match(text)
        raw_label = (mo.groupdict().get("label") or mo.groupdict().get("alt")) if mo else None
        if mo and raw_label and expected is not None and canon_label(raw_label) == expected:
            lab = canon_label(raw_label)
            rest = mo.group("rest").strip()
            _, extra = _split_inline(f"({lab}) {rest}", spec, expected)
            if extra:
                for lab2, txt in extra:
                    cur.options.append({"label": lab2, "text": [txt] if txt else []})
            else:
                cur.options.append({"label": lab, "text": [rest] if rest else []})
            continue
        prefix, parts = _split_inline(text, spec, expected)
        if parts:
            if prefix:
                (cur.options[-1]["text"] if cur.options else cur.stem).append(prefix)
            for lab2, txt in parts:
                cur.options.append({"label": lab2, "text": [txt] if txt else []})
            continue
        (cur.options[-1]["text"] if cur.options else cur.stem).append(text)

    return _finalize(questions)


def _finalize(questions: list[_Q]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, q in enumerate(questions):
        if q.number in seen:  # numbering restarts per section: keep (document, number) unique
            base = f"{q.number}-{(q.section or 'DUP')}"
            cand, k = base, 2
            while cand in seen:
                cand, k = f"{base}-{k}", k + 1
            q.number = cand
        seen.add(q.number)
        nxt = questions[i + 1] if i + 1 < len(questions) else None
        pages = sorted({ln["page"] for ln in q.lines})
        bands: dict[str, list[float]] = {}
        for p in pages:
            top = q.start_y - 2 if p == q.start_page else 0.0
            bottom: float | None = None
            if nxt is not None and nxt.start_page == p:
                bottom = nxt.start_y - 1
            bands[str(p)] = [max(top, 0.0), bottom if bottom is not None else -1.0]  # -1 = page bottom
        out.append(
            {
                "number": q.number,
                "external_question_id": q.external_question_id,
                "section_hint": q.section,
                "numerical_mode": q.numerical_mode,
                "given_answer_hint": q.given_answer_hint,
                "stem": q.stem,
                "options": [
                    {"label": o["label"], "external_option_id": q.option_ids.get(o["label"]), "text": o["text"]}
                    for o in q.options
                ],
                "pages": pages,
                "bands": bands,
                "lines": [
                    {"page": ln["page"], "bbox": ln["bbox"], "source": ln["source"], "conf": ln.get("conf")}
                    for ln in q.lines
                ],
            }
        )
    return out
