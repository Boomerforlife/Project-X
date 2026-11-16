"""JEE Advanced past papers (jeeadv.ac.in archive), any year: text-layer PDFs and scanned booklets.

Questions start with "Q.n" at the left margin; numbering restarts for each subject. Options are laid out in many ways
(stacked, side by side, 2x2 grids of graphs), so each question is cropped as one image *including its options*, exactly
as printed, and the student answers by choosing A-D. Scanned pages are OCR'd to find the markers, section instructions
and searchable text; text-layer pages use the text layer directly.

Excluded from crops: running headers/footers, "Space for rough work", and the printed answer boxes that the older
combined booklets carry ("Answers for the above questions / Ans for Q.5: (C)"). Those printed answers are returned
separately as the board's own answers.
"""

from __future__ import annotations

import io
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pxw.common.hashing import sha256_hex
from pxw.common.jsonio import atomic_write_bytes
from pxw.common.models import Warning
from pxw.normalize.text import build_normalized_text, content_hash
from pxw.storage import keys

LAYOUT_NAME = "jee_adv_crop"
# "Q.12 ..." / "Q 12" / "Q.12" alone / OCR's "Q.11Which ...". A stem line such as "Q3, respectively ..." (a point
# named Q3) is not a marker.
MARKER = re.compile(r"^\s*Q\s*[.,:]?\s*(\d{1,2})(?=\s|$|[A-Z(])")
SECTION_START = re.compile(r"^\s*This\s+section\s+contains\b", re.IGNORECASE)
SUBJECT = re.compile(r"\b(PHYSICS|CHEMISTRY|MATHEMATICS)\b")
# A section heading is "SECTION 1 (Maximum Marks: 24)", "SECTION – 2", "Section-A"; a stem line that merely begins
# with the word ("section of the mirror ...") is not.
SECTION = re.compile(r"^\s*(SECTION|Section)\s*[-–—:]?\s*(\d{1,2}|[IVX]{1,3}|[A-D])\b(?!\s+[a-z])")
STOP = re.compile(
    r"(space for rough work|answers? for the above|^\s*ans(wer)?s?\s*(for|to)?\s*q|^\s*answers?\s*[:\-]|end of the question paper|"
    r"^\s*jee\s*\(?advanced\)?\s*\d{4}|^\s*paper\s*[12]\s*$|^\s*\d+\s*/\s*\d+\s*$)",
    re.IGNORECASE,
)
# Printed board answers. Older booklets: "Ans for Q.5: (C)"; 2023+ booklets: an "Answer: A, C" box under each question.
ANSWER = re.compile(r"Ans(?:wer)?s?\s*(?:for|to)?\s*Q\s*[.,]?\s*(\d{1,2})\s*[:\-]\s*(.+)$", re.IGNORECASE)
ANSWER_INLINE = re.compile(r"^\s*Answers?\s*[:\-]\s*(.+)$", re.IGNORECASE)
ANY_ANSWER = re.compile(r"(\bAns(wer)?s?\s*(for|to)?\s*Q\s*[.,]?\s*\d|^\s*Answers?\s*[:\-])", re.IGNORECASE)
TYPE_RULES = [
    # The first defining sentence of a section wins (see parse_structure); OCR may break it anywhere after these words.
    (re.compile(r"ONE\s*OR\s*MORE(\s+THAN\s+ONE)?\b", re.IGNORECASE), "MULTI_MCQ"),
    (re.compile(r"ONLY\s+ONE\s+OF(\s+TH|\s*$)", re.IGNORECASE), "SINGLE_MCQ"),
    (re.compile(r"(MATCHING\s+LIST|LIST[\s-]*I\s+AND\s+LIST[\s-]*II)", re.IGNORECASE), "SINGLE_MCQ"),
    (re.compile(r"(NON[\s-]*NEGATIVE\s+INTEGER|SINGLE\s+DIGIT\s+INTEGER|NUMERICAL\s+VALUE|IS\s+AN?\s+INTEGER)", re.IGNORECASE), "NUMERICAL"),
]
DPI_CROP = 200
DPI_OCR = 150
BAND = 0.05  # top/bottom fraction treated as running header/footer


@dataclass
class _Line:
    page: int
    y0: float
    y1: float
    x0: float
    text: str


@dataclass
class _Q:
    seq: int
    number: int
    subject: str | None
    qtype: str | None
    page: int
    y: float
    segments: list[tuple[int, float, float]] = field(default_factory=list)
    gap_after: bool = False  # next number in this subject is missing: its marker was not read, so it may be merged here


def _latin_ratio(text: str) -> float:
    letters = [c for c in text if c.isalpha()]
    return sum(1 for c in letters if c.isascii()) / len(letters) if letters else 0.0


def page_lines(doc: Any, ocr_page: Callable[[bytes], list[tuple[str, tuple[float, float, float, float]]]] | None) -> tuple[list[list[_Line]], list[str]]:
    """Lines per page with PDF-point coordinates; scanned pages go through OCR. Returns (lines, method per page)."""
    out: list[list[_Line]] = []
    methods: list[str] = []
    for pno, page in enumerate(doc):
        text = page.get_text("text")
        lines: list[_Line] = []
        for b in page.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                t = "".join(s["text"] for s in ln["spans"]).replace("\xa0", " ").strip()
                if t:
                    x0, y0, _x1, y1 = ln["bbox"]
                    lines.append(_Line(pno, y0, y1, x0, t))
        if len(text.strip()) > 200:
            methods.append("TEXT")
        elif ocr_page is not None:
            # Scanned page, or a page whose content is one big image with a few stray text objects (2022 does this).
            # OCR the whole page; keep the stray text lines too unless OCR already covers that spot.
            png = page.get_pixmap(dpi=DPI_OCR, alpha=False).tobytes("png")
            scale = 72.0 / DPI_OCR
            ocr_lines = [
                _Line(pno, y0 * scale, y1 * scale, x0 * scale, t.strip())
                for t, (x0, y0, _x1, y1) in ocr_page(png)
                if t.strip()
            ]
            lines = ocr_lines + [
                ln for ln in lines if not any(abs(o.y0 - ln.y0) < 6 and abs(o.x0 - ln.x0) < 40 for o in ocr_lines)
            ]
            methods.append("OCR")
        else:
            methods.append("TEXT" if lines else "NONE")
        lines.sort(key=lambda ln: (ln.y0, ln.x0))
        out.append(lines)
    return out, methods


def _english_page(lines: list[_Line]) -> bool:
    """Combined booklets interleave Hindi pages. Text-layer Hindi is Devanagari; an English OCR pass over a Hindi scan
    yields noise without common English words. Maths symbols (U+1D400 block, Greek) must not count against English."""
    text = " ".join(ln.text for ln in lines)
    if len(text) < 40:
        return False
    letters = sum(1 for c in text if c.isalpha())
    deva = sum(1 for c in text if "ऀ" <= c <= "ॿ")
    if deva > 0.15 * max(1, letters):
        return False
    return len(re.findall(r"\b(the|of|is|and|to|in|be|let)\b", text, re.IGNORECASE)) >= 3


def _ends_question(text: str) -> bool:
    """Lines that end a question's region: rough-work/answer boxes, section headings, subject headings."""
    t = text.strip()
    return bool(STOP.search(t) or SECTION.match(t) or SECTION_START.match(t)
                or (len(t) < 40 and SUBJECT.search(t.upper()) and not MARKER.match(t)))


def parse_structure(doc: Any, lines: list[list[_Line]]) -> tuple[list[_Q], dict[tuple[str | None, int], str]]:
    qs: list[_Q] = []
    answers: dict[tuple[str | None, int], str] = {}
    subject: str | None = None
    qtype: str | None = None
    in_instructions = False
    seen: set[tuple[str | None, int]] = set()
    for pno, page in enumerate(doc):
        pl = lines[pno]
        if not pl or not _english_page(pl):
            continue
        h = float(page.rect.height)
        w = float(page.rect.width)
        for ln in pl:
            if len(ln.text) < 40:
                m_sub = SUBJECT.search(ln.text.upper())
                if m_sub:  # a short heading line such as "PART I : PHYSICS" or "Mathematics"
                    subject = m_sub.group(1)
            if SECTION.match(ln.text) or (SECTION_START.match(ln.text) and not in_instructions):
                in_instructions, qtype = True, None
            if in_instructions and qtype is None:
                # The first defining sentence of a section's instructions sets its type; the marking-scheme lines that
                # follow ("... correct numerical value is entered", "ONLY if ...") must not override it.
                for rx, t in TYPE_RULES:
                    if rx.search(ln.text):
                        qtype = t
                        break
            m_ans = ANSWER.search(ln.text)
            if m_ans:
                answers[(subject, int(m_ans.group(1)))] = m_ans.group(2).strip()
                continue
            m_inl = ANSWER_INLINE.match(ln.text)
            if m_inl and qs:
                answers.setdefault((qs[-1].subject, qs[-1].number), m_inl.group(1).strip())
                continue
            m = MARKER.match(ln.text)
            # No header/footer band here: questions can start at the very top of a scanned page, and running
            # headers ("JEE (Advanced) 2016", "Paper 1", "11/36") never look like markers.
            if m and ln.x0 < w * 0.18 and ln.y0 < (1 - BAND / 2) * h:
                n = int(m.group(1))
                in_instructions = False
                if (subject, n) in seen:
                    continue  # repeated marker (e.g. continuation page); keep the first
                seen.add((subject, n))
                qs.append(_Q(len(qs) + 1, n, subject, qtype, pno, ln.y0))
    for a, b in zip(qs, qs[1:], strict=False):
        if a.subject == b.subject and b.number > a.number + 1:
            a.gap_after = True
    # Regions: from each marker to the next marker / section heading / stop line, flowing across pages.
    for i, q in enumerate(qs):
        nxt = qs[i + 1] if i + 1 < len(qs) else None
        pno, top = q.page, q.y - 2
        while pno < len(doc):
            page = doc[pno]
            h = float(page.rect.height)
            limit = (1 - BAND) * h
            if nxt and nxt.page == pno:
                limit = min(limit, nxt.y - 2)
            for ln in lines[pno]:
                if ln.y0 > top + 4 and ln.y0 < limit and _ends_question(ln.text):
                    # Printed answer boxes have a border a few points above their text; stop clear of it.
                    limit = ln.y0 - (8 if ANY_ANSWER.search(ln.text) else 2)
                    break
            # A part on a following page must hold some question text, not just a header or a blank rough-work page.
            has_text = pno == q.page or any(
                top <= ln.y0 < limit and not _ends_question(ln.text) and not STOP.search(ln.text) for ln in lines[pno]
            )
            if limit - top > 12 and has_text:
                q.segments.append((pno, top, limit))
            if nxt and (nxt.page == pno or nxt.page < pno + 1):
                break
            if nxt is None and pno >= len(doc) - 1:
                break
            stopped = any(ln.y0 > top + 4 and _ends_question(ln.text) for ln in lines[pno])
            if stopped or (nxt and nxt.page == pno + 1 and nxt.y < h * 0.25):
                break
            pno += 1
            if pno >= len(doc) or not _english_page(lines[pno]):
                break
            # Continue below the next page's running header ("JEE (Advanced) 2019 ... Paper 1", "4/36").
            nh = float(doc[pno].rect.height)
            top = max([BAND * nh] + [ln.y1 + 2 for ln in lines[pno] if ln.y0 < 0.12 * nh and STOP.search(ln.text)])
    return qs, answers


def _strip_edge_rules(im: Any) -> Any:
    """Drop page rules (thin full-width lines) and blank rows at the top and bottom edges of a crop."""
    g = im.convert("L")
    w, h = g.size
    px = g.load()
    step = max(1, w // 400)

    def dark_frac(y: int) -> float:
        xs = range(0, w, step)
        return sum(1 for x in xs if px[x, y] < 160) / len(xs)

    def strip(rows: range) -> int:
        """Index of the first row (in scan order) that is real content. A wide rule counts as removable only when
        blank rows separate it from the content (a page rule); a box or table border touches its content."""
        ys = list(rows)
        i = 0
        while i < len(ys):
            f = dark_frac(ys[i])
            if f < 0.002:
                i += 1
                continue
            if f > 0.5:
                j = i
                while j < len(ys) and dark_frac(ys[j]) > 0.5:
                    j += 1  # rule thickness
                blank = 0
                while j + blank < len(ys) and dark_frac(ys[j + blank]) < 0.002:
                    blank += 1
                if j - i <= 8 and blank >= 4:
                    i = j + blank
                    continue
            return ys[i]
        return ys[0] if ys else 0

    top = strip(range(h))
    bottom = strip(range(h - 1, -1, -1))
    return im.crop((0, top, w, bottom + 1)) if bottom > top else im


def _trim(png: bytes) -> bytes:
    """Trim white margins and edge rules so crops are tight."""
    from PIL import Image, ImageChops

    im = _strip_edge_rules(Image.open(io.BytesIO(png)).convert("RGB"))
    bg = Image.new("RGB", im.size, (255, 255, 255))
    box = ImageChops.difference(im, bg).convert("L").point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box:
        return png
    pad = 8
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
    buf = io.BytesIO()
    im.crop(box).save(buf, format="PNG")
    return buf.getvalue()


def _png_size(png: bytes) -> tuple[int, int]:
    return int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")


def extract_jee_adv(
    pdf_path: str | Path,
    source_document_id: str,
    crops_dir: Path,
    *,
    ocr_page: Callable[[bytes], list[tuple[str, tuple[float, float, float, float]]]] | None = None,
) -> dict[str, Any]:
    import pymupdf

    crops_dir.mkdir(parents=True, exist_ok=True)
    out: list[dict[str, Any]] = []
    with pymupdf.open(str(pdf_path)) as doc:
        lines, methods = page_lines(doc, ocr_page)
        structure, answers = parse_structure(doc, lines)
        leaks: list[str] = []
        for q in structure:
            # Never ship a question image that shows its printed answer: drop the question instead.
            if any(
                ANY_ANSWER.search(ln.text) and ln.y1 > y0 + 1 and ln.y0 < y1 - 1
                for pno, y0, y1 in q.segments
                for ln in lines[pno]
            ):
                leaks.append(f"{(q.subject or 'X')[:1]}{q.number}")
                continue
            assets: list[dict[str, Any]] = []
            content: list[dict[str, Any]] = []
            texts: list[str] = []
            for k, (pno, y0, y1) in enumerate(q.segments, start=1):
                page = doc[pno]
                clip = pymupdf.Rect(0, y0, float(page.rect.width), y1) & page.rect
                png = _trim(page.get_pixmap(clip=clip, dpi=DPI_CROP, alpha=False).tobytes("png"))
                key = keys.derived_crop(source_document_id, str(q.seq), k)
                atomic_write_bytes(crops_dir / key.rsplit("/", 1)[-1], png)
                w, h = _png_size(png)
                ref = f"q{q.seq}-part{k}"
                assets.append({"asset_ref": ref, "kind": "IMAGE", "page": pno + 1, "bbox": [0.0, round(y0, 2), round(float(page.rect.width), 2), round(y1, 2)],
                               "sha256": sha256_hex(png), "mime_type": "image/png", "width": w, "height": h, "r2_key": key})
                seg_text = " ".join(ln.text for ln in lines[pno] if y0 <= ln.y0 < y1)
                seg_text = re.sub(r"\s+", " ", seg_text).strip()
                texts.append(seg_text)
                label = f"{q.subject.title() if q.subject else 'Question'} Q.{q.number}"
                content.append({"type": "image", "asset_ref": ref, "alt": (seg_text or label)[:300]})
            if not content:
                continue
            stem_text = re.sub(r"^\s*Q\s*[.,:]?\s*\d{1,2}\s*", "", " ".join(texts)).strip()
            qtype = q.qtype or "SINGLE_MCQ"
            options = [] if qtype == "NUMERICAL" else [
                {"label": lab, "external_option_id": lab, "content": [{"type": "paragraph", "text": f"({lab})"}]} for lab in "ABCD"
            ]
            fingerprint = " ".join(a["sha256"][:16] for a in assets)
            normalized = build_normalized_text(stem_text or f"image {assets[0]['sha256']}", [(o["label"], o["label"]) for o in options])
            warnings: list[str] = []
            if q.qtype is None:
                warnings.append(Warning.QUESTION_TYPE_UNKNOWN.value)
            if q.gap_after:
                warnings.append(Warning.POSSIBLE_MERGED_QUESTIONS.value)
            ext_id = f"{(q.subject or 'X')[:1]}{q.number}"
            out.append({
                "schema_version": 1,
                "question_number": str(q.seq),
                "external_question_id": ext_id,
                "section_hint": q.subject,
                "question_type_guess": qtype,
                "content": content,
                "options": options,
                "assets": assets,
                "page_start": q.segments[0][0] + 1,
                "page_end": q.segments[-1][0] + 1,
                "question_text": stem_text or f"JEE Advanced {ext_id} (image {assets[0]['sha256'][:12]})",
                "normalized_text": normalized,
                "content_hash": content_hash(normalized + " || " + fingerprint),
                "extraction": {
                    "method": "OCR" if methods[q.segments[0][0]] == "OCR" else "TEXT",
                    "ocr_engine": None,
                    "mean_confidence": None,
                    "warnings": warnings,
                },
            })
    printed = {f"{(s or 'X')[:1]}{n}": a for (s, n), a in answers.items()}
    stats = {
        "questions": len(out),
        "by_subject": {
            (s or "UNKNOWN"): sum(1 for q in out if q["section_hint"] == s) for s in ("PHYSICS", "CHEMISTRY", "MATHEMATICS", None)
        },
        "by_type": {t: sum(1 for q in out if q["question_type_guess"] == t) for t in ("SINGLE_MCQ", "MULTI_MCQ", "NUMERICAL")},
        "pages_ocr": methods.count("OCR"),
        "pages_text": methods.count("TEXT"),
        "printed_answers": len(printed),
        "dropped_answer_in_crop": leaks,
    }
    return {"layout": LAYOUT_NAME, "questions": out, "printed_answers": printed, "stats": stats}
