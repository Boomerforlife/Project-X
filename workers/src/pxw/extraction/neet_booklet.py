"""NEET (UG) printed test booklets published by NTA (pen-and-paper exam), English-medium codes.

Layout: an instructions page, then two columns separated by a vertical rule; subject headings such as
"Section - A (Physics)"; questions numbered 1..200 at a column's left edge, each followed by options (1)-(4), often with
figures. Each question is cropped with its options exactly as printed (flowing across columns and pages); options are
labelled "1".."4" as in the booklet, which is also how NTA's answer keys refer to them.

Robustness: a marker counts only when it is the next number in sequence at a column's left edge, so option labels and
numbers inside the text are never taken for questions. Booklets with Devanagari text (Hindi/bilingual codes) are not
read: questions are English only.
"""

from __future__ import annotations

import itertools
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pxw.common.hashing import sha256_hex
from pxw.common.jsonio import atomic_write_bytes
from pxw.extraction.jee_adv_crop import _png_size, _trim
from pxw.extraction.nta_cbt_image import strip_mirror_marks
from pxw.normalize.text import build_normalized_text, content_hash
from pxw.storage import keys

LAYOUT_NAME = "neet_booklet"
DPI = 200
MARKER = re.compile(r"^\s*(\d{1,3})\s*\.\s*(.*)$")
HEADING = re.compile(
    r"^\s*(?:Section\s*[-–:]?\s*[AB]\s*)?\(?\s*(?:Biology\s*[:-]\s*)?(Physics|Chemistry|Botany|Zoology|Biology)\s*\)?"
    r"\s*(?:\(?\s*Section\s*[-–:]?\s*[AB]\s*\)?)?\s*$",
    re.IGNORECASE,
)
# Subject vocabulary for booklets that print no headings (2020): voted per block of consecutive questions.
VOCAB = {
    "PHYSICS": r"velocity|acceleration|force|momentum|friction|lens|mirror|refractive|wavelength|frequency|charge|"
    r"capacitor|resistance|current|magnetic|electric|potential|photon|oscillat|gravitation|torque|kinetic|"
    r"newton|joule|ampere|ohm|tesla|\bm/s\b|\bms\b|radius|mass of",
    "CHEMISTRY": r"\bmol\b|moles?\b|reaction|compound|aqueous|solution|acid|oxidation|\bions?\b|bond|organic|"
    r"equilibrium|enthalpy|molecules?|salt|hybridi|isomer|\bpH\b|electrolys|catalyst|precipitate|alkane|alkene|"
    r"benzene|molar|electron|orbital|IUPAC|\bg/mol|atom",
    "BOTANY": r"plant|leaf|leaves|flower|root|stem\b|seed|chlorophyll|photosynth|pollen|xylem|phloem|fung|alga|"
    r"angiosperm|gymnosperm|meristem|auxin|gibberellin|cytokinin|ovule|stomata|tissue culture|bryophyt|pteridophyt|"
    r"chloroplast|crop|ecosystem|species|population",
    "ZOOLOGY": r"animal|human|blood|heart|kidney|hormone|nerve|neuron|muscle|insect|mammal|frog|cockroach|earthworm|"
    r"sperm|ovum|embryo|gland|lung|digest|enzyme|antibod|immun|disease|vaccin|chordat|vertebrat|placenta|menstru",
}
SUBJECT_CODE = {"physics": "PHYSICS", "chemistry": "CHEMISTRY", "botany": "BOTANY", "zoology": "ZOOLOGY", "biology": "BOTANY"}


@dataclass
class _Line:
    page: int
    col: int
    x0: float
    y0: float
    y1: float
    text: str


@dataclass
class _Q:
    number: int
    subject: str | None
    page: int
    col: int
    y: float
    segments: list[tuple[int, int, float, float]] = field(default_factory=list)  # (page, col, y0, y1)
    gap_after: bool = False


def _columns(page: Any) -> tuple[list[tuple[float, float]], float, float]:
    """Column x-ranges and the content band (top, bottom), from the vertical rule between the columns."""
    w, h = float(page.rect.width), float(page.rect.height)
    rule = None
    for d in page.get_drawings():
        r = d["rect"]
        if r.width < 3 and r.height > 0.4 * h and 0.35 * w < r.x0 < 0.65 * w:
            rule = r
            break
    if rule is None:
        return [(0.0, w / 2), (w / 2, w)], 0.08 * h, 0.94 * h
    # Stay 2pt clear of the rule so it never shows at a crop's edge.
    return [(0.0, float(rule.x0) - 2), (float(rule.x1) + 2, w)], float(rule.y0) - 4, float(rule.y1) + 2


def _lines(page: Any, pno: int, cols: list[tuple[float, float]]) -> list[_Line]:
    out = []
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            t = "".join(s["text"] for s in ln["spans"]).replace("\xa0", " ").strip()
            if not t:
                continue
            x0, y0, _x1, y1 = ln["bbox"]
            col = 0 if x0 < cols[0][1] else 1
            out.append(_Line(pno, col, x0, y0, y1, t))
    out.sort(key=lambda ln: (ln.col, ln.y0, ln.x0))
    return out


def _devanagari_share(text: str) -> float:
    letters = [c for c in text if c.isalpha()]
    return sum(1 for c in letters if "ऀ" <= c <= "ॿ") / len(letters) if letters else 0.0


def parse(doc: Any) -> tuple[list[_Q], dict[str, Any]]:
    layout = [_columns(p) for p in doc]
    lines = [_lines(p, i, layout[i][0]) for i, p in enumerate(doc)]
    qs: list[_Q] = []
    subject: str | None = None
    started = False
    expected = 1
    for pno in range(len(doc)):
        cols, top, bottom = layout[pno]
        # Each column's text margin (its leftmost line); markers sit right at it.
        margin = {c: min((ln.x0 for ln in lines[pno] if ln.col == c and top <= ln.y0 <= bottom), default=cols[c][0])
                  for c in (0, 1)}
        for ln in lines[pno]:
            if not (top <= ln.y0 <= bottom):
                continue  # running header / footer (booklet code, page number)
            m_head = HEADING.match(ln.text)
            if m_head and len(ln.text) < 60:
                subject = SUBJECT_CODE[m_head.group(1).lower()]
                started = True
                continue
            m = MARKER.match(ln.text)
            if not started and pno >= 1 and m and int(m.group(1)) == 1 and ln.x0 - margin[ln.col] < 3:
                started = True  # booklets without subject headings (2020): questions start after the cover page
            if not started:
                continue  # instructions page(s)
            col_w = cols[ln.col][1] - cols[ln.col][0]
            if m and int(m.group(1)) == expected and ln.x0 - margin[ln.col] < 0.04 * col_w:
                qs.append(_Q(expected, subject, pno, ln.col, ln.y0))
                expected += 1
    # Regions: from each marker to the next one in reading order (column by column, page by page).
    order = [(p, c) for p in range(len(doc)) for c in (0, 1)]
    for i, q in enumerate(qs):
        nxt = qs[i + 1] if i + 1 < len(qs) else None
        start = order.index((q.page, q.col))
        top_y = q.y - 2
        for k in range(start, len(order)):
            p, c = order[k]
            _cols, top, bottom = layout[p]
            y0 = top_y if k == start else top
            y1 = bottom
            if nxt and (nxt.page, nxt.col) == (p, c):
                y1 = nxt.y - 2
            # A subject heading ends the question too.
            for ln in lines[p]:
                if ln.col == c and y0 + 4 < ln.y0 < y1 and HEADING.match(ln.text) and len(ln.text) < 60:
                    y1 = ln.y0 - 2
                    break
            has_text = any(ln.col == c and y0 <= ln.y0 < y1 for ln in lines[p])
            if y1 - y0 > 10 and (k == start or has_text):
                q.segments.append((p, c, y0, y1))
            if nxt is None or (nxt.page, nxt.col) == (p, c) or k - start >= 3:
                break
    for a, b in itertools.pairwise(qs):
        if b.number != a.number + 1:
            a.gap_after = True
    inferred = _infer_blocks(qs, lines) if qs and all(q.subject is None for q in qs) else 0
    body = " ".join(ln.text for pl in lines for ln in pl)
    return qs, {"devanagari_share": round(_devanagari_share(body), 3), "pages": len(doc), "subjects_inferred": inferred}


def _infer_blocks(qs: list[_Q], lines: list[list[_Line]], block: int = 45) -> int:
    """No headings (2020): physics and chemistry each fill one contiguous run of 45 questions; biology fills 90 with
    botany and zoology mixed. Vote each run between PHYSICS, CHEMISTRY and BIOLOGY; physics/chemistry must win clearly
    and go to one run only. Biology runs keep no subject (botany vs zoology is decided per question later)."""
    if len(qs) % block:
        return 0
    groups = {
        "PHYSICS": VOCAB["PHYSICS"],
        "CHEMISTRY": VOCAB["CHEMISTRY"],
        "BIOLOGY": VOCAB["BOTANY"] + "|" + VOCAB["ZOOLOGY"],
    }
    runs = [qs[i:i + block] for i in range(0, len(qs), block)]
    picks = []
    for run in runs:
        text = " ".join(ln.text for q in run for p, c, y0, y1 in q.segments for ln in lines[p] if ln.col == c and y0 <= ln.y0 < y1)
        scores = sorted(((len(re.findall(rx, text, re.IGNORECASE)), s) for s, rx in groups.items()), reverse=True)
        picks.append(scores[0][1] if scores[0][0] >= 20 and scores[0][0] >= 1.4 * scores[1][0] else None)
    n = 0
    for run, sub in zip(runs, picks, strict=True):
        if sub in ("PHYSICS", "CHEMISTRY") and picks.count(sub) == 1:
            for q in run:
                q.subject = sub
                n += 1
    return n


def extract_neet_booklet(
    pdf_path: str | Path,
    source_document_id: str,
    crops_dir: Path,
    *,
    strip_marks: bool = True,
    expected_questions: tuple[int, ...] = (180, 200),
) -> dict[str, Any]:
    import pymupdf

    crops_dir.mkdir(parents=True, exist_ok=True)
    out: list[dict[str, Any]] = []
    stats: dict[str, Any] = {}
    with pymupdf.open(str(pdf_path)) as doc:
        if strip_marks:
            marks = strip_mirror_marks(doc)
            marks.pop("xrefs", None)
            stats.update(marks)
        qs, info = parse(doc)
        stats.update(info)
        if info["devanagari_share"] > 0.05:
            # Hindi or bilingual booklet code: questions are English only, so this booklet is not read.
            stats.update({"questions": 0, "skipped": "not an English-medium booklet"})
            return {"layout": LAYOUT_NAME, "questions": [], "stats": stats}
        complete = len(qs) in expected_questions
        for q in qs:
            assets, content, texts = [], [], []
            for k, (pno, col, y0, y1) in enumerate(q.segments, start=1):
                page = doc[pno]
                cols, _t, _b = _columns(page)
                x0, x1 = cols[col]
                clip = pymupdf.Rect(x0, y0, x1, y1) & page.rect
                png = _trim(page.get_pixmap(clip=clip, dpi=DPI, alpha=False).tobytes("png"))
                key = keys.derived_crop(source_document_id, str(q.number), k)
                atomic_write_bytes(crops_dir / key.rsplit("/", 1)[-1], png)
                w, h = _png_size(png)
                ref = f"q{q.number}-part{k}"
                assets.append({"asset_ref": ref, "kind": "IMAGE", "page": pno + 1,
                               "bbox": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
                               "sha256": sha256_hex(png), "mime_type": "image/png", "width": w, "height": h, "r2_key": key})
                seg = " ".join(ln.text for ln in _lines(page, pno, cols) if ln.col == col and y0 <= ln.y0 < y1)
                texts.append(re.sub(r"\s+", " ", seg).strip())
            if not assets:
                continue
            text = re.sub(r"^\s*\d{1,3}\s*\.\s*", "", " ".join(texts)).strip()
            for k, a in enumerate(assets):
                content.append({"type": "image", "asset_ref": a["asset_ref"], "alt": (texts[k] or f"Question {q.number}")[:300]})
            # Labels A-D (the platform's option labels); the booklet's own numbers stay visible as "(1)".."(4)" and are
            # the external ids, which is how NTA's NEET answer keys name options.
            options = [{"label": "ABCD"[i], "external_option_id": str(i + 1),
                        "content": [{"type": "paragraph", "text": f"({i + 1})"}]} for i in range(4)]
            fingerprint = " ".join(a["sha256"][:16] for a in assets)
            normalized = build_normalized_text(text or f"image {assets[0]['sha256']}", [(o["label"], o["external_option_id"]) for o in options])
            warnings: list[str] = []
            if q.subject is None:
                warnings.append("SUBJECT_UNKNOWN")
            if q.gap_after or not complete:
                warnings.append("POSSIBLE_MERGED_QUESTIONS")
            out.append({
                "schema_version": 1,
                "question_number": str(q.number),
                "external_question_id": str(q.number),
                "section_hint": q.subject,
                "question_type_guess": "SINGLE_MCQ",
                "content": content,
                "options": options,
                "assets": assets,
                "page_start": q.segments[0][0] + 1,
                "page_end": q.segments[-1][0] + 1,
                "question_text": text or f"NEET question {q.number} (image {assets[0]['sha256'][:12]})",
                "normalized_text": normalized,
                "content_hash": content_hash(normalized + " || " + fingerprint),
                "extraction": {"method": "TEXT", "ocr_engine": None, "mean_confidence": None, "warnings": warnings},
            })
    stats.update({
        "questions": len(out),
        "complete": complete,
        "by_subject": {s: sum(1 for q in out if q["section_hint"] == s) for s in ("PHYSICS", "CHEMISTRY", "BOTANY", "ZOOLOGY")},
        "multi_part": sum(1 for q in out if len(q["assets"]) > 1),
    })
    return {"layout": LAYOUT_NAME, "questions": out, "stats": stats}


ExtractFn = Callable[..., dict[str, Any]]
