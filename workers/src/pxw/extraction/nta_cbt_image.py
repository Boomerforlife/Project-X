"""NTA computer-based-test paper layout (JEE Main 2024+ style), where the question content is images.

In these PDFs the text layer holds only metadata:
    Question Number : 6 Question Id : 695278231 Question Type : MCQ Option Shuffling : Yes ...
    Options :
    695278786.          <- option id; the option itself is an image to its right
The stem, the options, and any maths (matrices, fractions) are embedded images. So instead of turning text into
questions, this module crops each question's stem and each option from the page at high resolution and keeps NTA's
question/option ids (official answer keys are published per id). OCR text is added only as searchable/alt text; what
students see is the original crop, so there is no transcription error. A vision model can later replace the crops with
text + LaTeX.

Output: NormalizedQuestion dicts (same contract as the text pipeline), with crops written to `crops_dir`.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pxw.common.hashing import sha256_hex
from pxw.common.jsonio import atomic_write_bytes
from pxw.normalize.text import build_normalized_text, content_hash
from pxw.storage import keys

# 2019/early-2020 papers have no "Question Id"; their options are labelled "1." .. "4." instead of by option id.
HEADER = re.compile(r"Question Number\s*:\s*(\d+)\s*(?:Question Id\s*:\s*(\d+)\s*)?Question Type\s*:\s*([A-Z]+)")
SECTION = re.compile(r"^\s*(Mathematics|Physics|Chemistry)\s+Section\s+([A-Z])\s*$", re.IGNORECASE)
OPTION_ID = re.compile(r"^\s*(\d{6,})\.\s*(.*)$")
OPTION_NUM = re.compile(r"^\s*([1-4])\.\s*$")
SECTION_NO = re.compile(r"Section\s*Number\s*:\s*(\d+)", re.IGNORECASE)
# Third-party mirrors stamp their name on NTA's pages; these lines are removed before anything is read.
MIRROR_TEXT = re.compile(r"(www\.)?p(re|er)pp\.in|\bprepp\b", re.IGNORECASE)
ENGLISH_WORDS = re.compile(
    r"\b(the|of|is|and|in|to|if|let|which|find|value|then|are|be|for|with|at|by|from|an|that|this|given|equal|"
    r"correct|following|statement|number|its|has|have|will|when|where|as|on|one|two|what)\b",
    re.IGNORECASE,
)
OPTIONS_LINE = re.compile(r"^\s*Options\s*:\s*$")
# Metadata lines that are not question content.
META = re.compile(
    r"(Question Number|Question Id|Question Type|Option Shuffling|Display Question Number|Is Question Mandatory|"
    r"Single Line Question Option|Option Orientation|Calculator|Response Time|Think Time|Minimum Instruction Time|"
    r"Response Type|Evaluation Required|Show Word Count|Answers Type|Text Areas|Possible Answers|Correct Marks|"
    r"Wrong Marks|Section (Id|Number|type|Marks)|Sub-Section|Mark As Answered|Clear Response|Is Section Default|"
    r"Keyboard Layout|^Inscript$|Instruction Time|Question Mandatory|Mandatory or Optional|Option Orientation)",
    re.IGNORECASE,
)
NUMERIC_MARKER = re.compile(r"Response Type\s*:\s*Numeric|Possible Answers\s*:", re.IGNORECASE)
LAYOUT_NAME = "nta_cbt_image"
DPI = 200
PAD = 1.5


def looks_like(pdf_path: str | Path) -> bool:
    """True when the text layer has NTA 'Question Number : n Question Id : id' headers."""
    import pymupdf

    with pymupdf.open(str(pdf_path)) as d:
        for page in list(d)[:4]:
            if HEADER.search(page.get_text("text")):
                return True
    return False


@dataclass
class _Line:
    page: int
    y0: float
    y1: float
    x0: float
    x1: float
    text: str


@dataclass
class _Opt:
    external_id: str | None
    page: int
    y0: float
    y1: float
    x1: float
    rects: list[tuple[float, float, float, float]] = field(default_factory=list)


@dataclass
class _Q:
    number: int
    external_id: str | None
    qtype: str
    section: str | None
    header_page: int
    header_bottom: float
    options_line: tuple[int, float] | None = None  # (page, y) of "Options :"
    end: tuple[int, float] | None = None  # (page, y) where this question's content ends
    stem_rects: dict[int, list[tuple[float, float, float, float]]] = field(default_factory=dict)
    options: list[_Opt] = field(default_factory=list)
    numeric_marker: bool = False
    section_no: int | None = None  # "Section Number : n" (2019/early 2020 print no subject names)


def _lines(page: Any, pno: int) -> list[_Line]:
    out: list[_Line] = []
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            t = "".join(s["text"] for s in ln["spans"]).strip()
            if t:
                x0, y0, x1, y1 = ln["bbox"]
                out.append(_Line(pno, y0, y1, x0, x1, t))
    out.sort(key=lambda l: (l.y0, l.x0))
    return out


def _images(page: Any) -> list[tuple[float, float, float, float]]:
    rects = []
    for info in page.get_image_info():
        x0, y0, x1, y1 = info["bbox"]
        if (x1 - x0) * (y1 - y0) > 4:  # ignore hairline artefacts
            rects.append((x0, y0, x1, y1))
    return rects


def _union(rs: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
    return (min(r[0] for r in rs), min(r[1] for r in rs), max(r[2] for r in rs), max(r[3] for r in rs))


def _crop(page: Any, rect: tuple[float, float, float, float], min_top: float = 0.0) -> bytes:
    import pymupdf

    r = pymupdf.Rect(rect[0] - PAD, max(rect[1] - PAD, min_top), rect[2] + PAD, rect[3] + PAD) & page.rect
    return page.get_pixmap(clip=r, dpi=DPI, alpha=False).tobytes("png")


def _png_size(png: bytes) -> tuple[int, int]:
    return int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")


def parse_structure(doc: Any) -> list[_Q]:
    """Walk every page once and attribute lines and images to questions, stems and options."""
    questions: list[_Q] = []
    section: str | None = None
    section_no: int | None = None
    cur: _Q | None = None
    in_options = False

    for pno, page in enumerate(doc):
        lines = _lines(page, pno)
        images = _images(page)
        # Events on this page in reading order: lines, plus images placed by their top edge.
        meta_bottom_by_q: dict[int, float] = {}
        for ln in lines:
            m_sec = SECTION.match(ln.text)
            m_head = HEADER.search(ln.text)
            if m_sec:
                section = m_sec.group(1).upper()
                if cur:
                    cur.end = cur.end or (pno, ln.y0)
                continue
            m_secno = SECTION_NO.search(ln.text)
            if m_secno:
                section_no = int(m_secno.group(1))
            if m_head:
                if cur:
                    cur.end = cur.end or (pno, ln.y0)
                cur = _Q(int(m_head.group(1)), m_head.group(2), m_head.group(3).upper(), section, pno, ln.y1)
                cur.section_no = section_no
                questions.append(cur)
                in_options = False
                continue
            if cur is None:
                continue
            if NUMERIC_MARKER.search(ln.text):
                cur.numeric_marker = True
            if OPTIONS_LINE.match(ln.text):
                cur.options_line = (pno, ln.y1)
                in_options = True
                continue
            m_opt = OPTION_ID.match(ln.text) if in_options else None
            if m_opt:
                cur.options.append(_Opt(m_opt.group(1), pno, ln.y0, ln.y1, ln.x1))
                continue
            m_num = OPTION_NUM.match(ln.text) if in_options and all(o.external_id is None for o in cur.options) else None
            if m_num:
                cur.options.append(_Opt(None, pno, ln.y0, ln.y1, ln.x1))
                continue
            if META.search(ln.text):
                # Header continuation lines push the stem start down; trailing metadata ends the stem.
                if pno == cur.header_page and (ln.y0 - cur.header_bottom < 14 or (
                    not cur.stem_rects and not any(cur.header_bottom - 1 <= r[1] < ln.y0 for r in images)
                )):
                    cur.header_bottom = max(cur.header_bottom, ln.y1)
                    meta_bottom_by_q[id(cur)] = cur.header_bottom
                elif not in_options:
                    # Trailing metadata (e.g. "Response Type : Numeric ... Possible Answers : 1") ends the stem.
                    cur.options_line = cur.options_line or (pno, ln.y0)
                    in_options = True
                continue
            # A real text line inside a question: belongs to the stem or to the nearest option.
            rect = (ln.x0, ln.y0, ln.x1, ln.y1)
            _assign(cur, pno, rect, in_options)

        for rect in images:
            owner = _owner_for(questions, pno, rect)
            if owner is not None:
                _assign(owner, pno, rect, _after_options_line(owner, pno, rect))
    if cur and cur.end is None:
        cur.end = (len(doc) - 1, float("inf"))
    return questions


def _after(pos: tuple[int, float] | None, pno: int, y: float) -> bool:
    return pos is not None and (pno > pos[0] or (pno == pos[0] and y >= pos[1] - 1))


def _owner_for(questions: list[_Q], pno: int, rect: tuple[float, float, float, float]) -> _Q | None:
    """The question whose header precedes this image and whose end comes after it."""
    cy = (rect[1] + rect[3]) / 2
    best = None
    for q in questions:
        starts_before = q.header_page < pno or (q.header_page == pno and q.header_bottom <= cy)
        ends_after = q.end is None or q.end[0] > pno or (q.end[0] == pno and cy < q.end[1])
        if starts_before and ends_after:
            best = q
    return best


def _after_options_line(q: _Q, pno: int, rect: tuple[float, float, float, float]) -> bool:
    return _after(q.options_line, pno, (rect[1] + rect[3]) / 2)


def _assign(q: _Q, pno: int, rect: tuple[float, float, float, float], in_options: bool) -> None:
    if in_options and not q.options:
        return  # after a numerical question's trailing metadata: placeholders, not content
    if in_options and q.options:
        cy = (rect[1] + rect[3]) / 2
        same_page = [o for o in q.options if o.page == pno] or q.options
        opt = min(same_page, key=lambda o: abs((o.y0 + o.y1) / 2 - cy))
        opt.rects.append(rect)
    else:
        q.stem_rects.setdefault(pno, []).append(rect)


def strip_mirror_marks(doc: Any) -> dict[str, int]:
    """Remove what a third-party mirror added to NTA's pages: images repeated at the same place on (nearly) every
    page (the mirror's logo/watermark; NTA's question images are each unique) and the mirror's name in the text."""
    import pymupdf

    pages = len(doc)
    seen: dict[tuple[int, tuple[int, ...]], int] = {}
    for page in doc:
        for info in page.get_image_info(xrefs=True):
            k = (info["xref"], tuple(round(v) for v in info["bbox"]))
            seen[k] = seen.get(k, 0) + 1
    page_w, page_h = float(doc[0].rect.width), float(doc[0].rect.height)

    def mark_like(bbox: tuple[int, ...]) -> bool:
        # A watermark is big (mid-page logo) or sits in the top/bottom margin (corner logo). Small images inside the
        # content area are never treated as marks, even if repeated: they may be real (identical) option images.
        x0, y0, x1, y1 = bbox
        big = (x1 - x0) * (y1 - y0) > 0.05 * page_w * page_h
        margin = y1 <= 0.08 * page_h or y0 >= 0.92 * page_h
        return big or margin

    repeated = {x for (x, b), c in seen.items() if x and pages >= 5 and c >= 0.8 * pages and mark_like(b)}
    images = texts = 0
    for page in doc:
        for x in repeated:
            if any(i["xref"] == x for i in page.get_image_info(xrefs=True)):
                page.delete_image(x)
                images += 1
        hit = False
        for b in page.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                if MIRROR_TEXT.search("".join(sp["text"] for sp in ln["spans"])):
                    page.add_redact_annot(ln["bbox"])
                    hit = True
                    texts += 1
        if hit:
            page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    return {"mark_images": images, "mark_texts": texts}


def _english_score(text: str) -> int:
    return len(ENGLISH_WORDS.findall(text or ""))


def _pick_english(
    doc: Any, structure: list[_Q], ocr: Callable[[bytes], tuple[str, float | None, str | None]] | None
) -> tuple[list[_Q], set[int], int]:
    """Bilingual papers print every question once per language (same Question Id, or the same number in a row).
    Keep one version per question: the one whose stem reads as English. Returns (kept, unchecked ids, dropped)."""
    groups: list[list[_Q]] = []
    for q in structure:
        prev = groups[-1][0] if groups else None
        same = prev is not None and (
            (q.external_id is not None and q.external_id == prev.external_id)
            or (q.external_id is None and prev.external_id is None and q.number == prev.number)
        )
        if same:
            groups[-1].append(q)
        else:
            groups.append([q])
    kept: list[_Q] = []
    unchecked: set[int] = set()
    dropped = 0
    for g in groups:
        if len(g) == 1:
            kept.append(g[0])
            continue
        dropped += len(g) - 1
        if ocr is None:
            kept.append(g[0])
            unchecked.add(id(g[0]))
            continue
        scored = []
        for i, q in enumerate(g):
            text = ""
            for page_no, rects in sorted(q.stem_rects.items()):
                png = _crop(doc[page_no], _union(rects), q.header_bottom + 0.5 if page_no == q.header_page else 0.0)
                text += " " + ocr(_for_ocr(png))[0]
            scored.append((_english_score(text), -i, q))
        best = max(scored, key=lambda t: (t[0], t[1]))
        if best[0] == 0 and all(sc == 0 for sc, _i, _q in scored):
            unchecked.add(id(best[2]))  # no English words either way (pure notation): language not confirmed
        kept.append(best[2])
    return kept, unchecked, dropped


def extract_nta_cbt_image(
    pdf_path: str | Path,
    source_document_id: str,
    crops_dir: Path,
    *,
    ocr: Callable[[bytes], tuple[str, float | None, str | None]] | None = None,
    strip_marks: bool = False,
) -> dict[str, Any]:
    """Return {"layout", "questions": [NormalizedQuestion dict], "stats"}; crops are written to crops_dir.
    English only: bilingual papers keep the English version of each question. strip_marks=True first removes a
    mirror's watermark (for NTA papers fetched from a mirror after NTA took them down)."""
    import pymupdf

    crops_dir.mkdir(parents=True, exist_ok=True)
    out: list[dict[str, Any]] = []
    stats: dict[str, Any] = {"questions": 0, "mcq": 0, "numerical": 0, "stems_without_content": 0,
                             "options_without_content": 0, "other_language_blocks_dropped": 0}
    with pymupdf.open(str(pdf_path)) as doc:
        if strip_marks:
            stats.update(strip_mirror_marks(doc))
        structure, unchecked, dropped = _pick_english(doc, parse_structure(doc), ocr)
        stats["other_language_blocks_dropped"] = dropped
        for q in structure:
            numerical = q.qtype in {"SA", "NAT"} or (q.numeric_marker and not q.options)
            assets: list[dict[str, Any]] = []
            confs: list[float] = []
            engine: str | None = None
            n = 0

            def add_crop(
                page_no: int,
                rect: tuple[float, float, float, float],
                ref: str,
                run_ocr: bool = True,
                q: _Q = q,
                confs: list[float] = confs,
                assets: list[dict[str, Any]] = assets,
            ) -> dict[str, Any]:
                nonlocal n, engine
                n += 1
                png = _crop(doc[page_no], rect, q.header_bottom + 0.5 if page_no == q.header_page else 0.0)
                key = keys.derived_crop(source_document_id, str(q.number), n)
                fname = key.rsplit("/", 1)[-1]
                atomic_write_bytes(crops_dir / fname, png)
                w, h = _png_size(png)
                text = ""
                if ocr is not None and run_ocr:
                    text, conf, engine_name = ocr(_for_ocr(png))
                    engine = engine or engine_name
                    if conf is not None:
                        confs.append(conf)
                asset = {
                    "asset_ref": ref,
                    "kind": "IMAGE",
                    "page": page_no + 1,
                    "bbox": [round(v, 2) for v in rect],
                    "sha256": sha256_hex(png),
                    "mime_type": "image/png",
                    "width": w,
                    "height": h,
                    "r2_key": key,
                }
                assets.append(asset)
                return {"asset": asset, "text": text}

            content: list[dict[str, Any]] = []
            stem_text_parts: list[str] = []
            for k, (page_no, rects) in enumerate(sorted(q.stem_rects.items()), start=1):
                c = add_crop(page_no, _union(rects), f"q{q.number}-stem{k}")
                stem_text_parts.append(c["text"])
                content.append(
                    {
                        "type": "image",
                        "asset_ref": c["asset"]["asset_ref"],
                        "alt": _alt(c["text"], f"Question {q.number}"),
                    }
                )
            if not content:
                stats["stems_without_content"] += 1

            options: list[dict[str, Any]] = []
            opt_texts: list[tuple[str, str]] = []
            if not numerical:
                for i, o in enumerate(q.options):
                    label = "ABCDE"[i] if i < 5 else str(i + 1)
                    if not o.rects:
                        stats["options_without_content"] += 1
                        options.append({"label": label, "external_option_id": o.external_id, "content": []})
                        continue
                    # Options are short; OCR only the stem (it is search/alt text, students see the crop).
                    c = add_crop(o.page, _union(o.rects), f"q{q.number}-opt{label}", run_ocr=False)
                    opt_texts.append((label, c["text"] or f"image {c['asset']['sha256'][:24]}"))
                    options.append(
                        {
                            "label": label,
                            "external_option_id": o.external_id,
                            "content": [
                                {
                                    "type": "image",
                                    "asset_ref": c["asset"]["asset_ref"],
                                    "alt": _alt(c["text"], f"Option {label}"),
                                }
                            ],
                        }
                    )

            stem_text = " ".join(t for t in stem_text_parts if t).strip()
            warnings: list[str] = []
            if not content:
                warnings.append("EMPTY_QUESTION_TEXT")
            if not numerical and len(q.options) != 4:
                warnings.append("OPTION_COUNT_UNUSUAL")
            if any(not o["content"] for o in options):
                warnings.append("EMPTY_OPTION")
            if id(q) in unchecked:
                warnings.append("LANGUAGE_NOT_CONFIRMED")
            # The hash must separate questions even when OCR is weak, so it includes the crop fingerprints.
            fingerprint = " ".join(a["sha256"][:16] for a in assets)
            # Without OCR text, use the crop fingerprints so unrelated questions never look alike to dedupe or grouping.
            stem_sha = next((a["sha256"] for a in assets if "-stem" in a["asset_ref"]), "")
            normalized = build_normalized_text(stem_text or f"image {stem_sha}", opt_texts)
            out.append(
                {
                    "schema_version": 1,
                    "question_number": str(q.number),
                    "external_question_id": q.external_id,  # None for 2019-style papers (no NTA ids)
                    "section_hint": q.section if q.section in {"PHYSICS", "CHEMISTRY", "MATHEMATICS"} else None,
                    "question_type_guess": "NUMERICAL" if numerical else "SINGLE_MCQ",
                    "content": content,
                    "options": options,
                    "assets": assets,
                    "page_start": q.header_page + 1,
                    "page_end": max([a["page"] for a in assets] or [q.header_page + 1]),
                    "question_text": stem_text or f"Question {q.number} (image {stem_sha[:12]})",
                    "normalized_text": normalized,
                    "content_hash": content_hash(normalized + " || " + fingerprint),
                    "extraction": {
                        "method": "OCR",
                        "ocr_engine": engine,
                        "mean_confidence": round(sum(confs) / len(confs), 3) if confs else None,
                        "warnings": warnings,
                    },
                }
            )
            out[-1]["_section_no"] = q.section_no
            stats["questions"] += 1
            stats["numerical" if numerical else "mcq"] += 1
    stats["subjects_inferred"] = _infer_subjects(out)
    for q in out:
        q.pop("_section_no", None)
    return {"layout": LAYOUT_NAME, "questions": out, "stats": stats}


def _infer_subjects(out: list[dict[str, Any]]) -> int:
    """Papers without "Physics Section A" headings: decide each section's subject by a clear vocabulary vote over its
    own (OCR) text; a subject is never given to two sections. Undecided questions get SUBJECT_UNKNOWN (review)."""
    from pxw.extraction.jee_adv_crop import _SUBJECT_WORDS

    pending = [q for q in out if q["section_hint"] is None]
    if not pending:
        return 0
    blocks: dict[Any, list[dict[str, Any]]] = {}
    for q in pending:
        blocks.setdefault(q.get("_section_no"), []).append(q)
    picks: dict[Any, str] = {}
    for b, qs in blocks.items():
        if b is None:
            continue
        text = " ".join(q["question_text"] for q in qs)
        scores = sorted(((len(re.findall(rx, text, re.IGNORECASE)), sub) for sub, rx in _SUBJECT_WORDS.items()), reverse=True)
        if scores[0][0] >= 12 and scores[0][0] >= 1.6 * scores[1][0]:
            picks[b] = scores[0][1]
    named = {q["section_hint"] for q in out if q["section_hint"]}
    chosen = list(picks.values())
    n = 0
    for b, qs in blocks.items():
        sub = picks.get(b)
        ok = sub is not None and chosen.count(sub) == 1 and sub not in named
        for q in qs:
            if ok:
                q["section_hint"] = sub
                n += 1
            else:
                q["extraction"]["warnings"].append("SUBJECT_UNKNOWN")
    return n


def _for_ocr(png: bytes, max_width: int = 1100) -> bytes:
    """Downscale a 200-dpi crop for OCR: text stays legible and OCR runs several times faster."""
    import io

    from PIL import Image

    im = Image.open(io.BytesIO(png))
    if im.width <= max_width:
        return png
    im = im.convert("L").resize((max_width, max(1, round(im.height * max_width / im.width))))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _alt(text: str, fallback: str) -> str:
    t = re.sub(r"\s+", " ", text or "").strip()
    return (t or fallback)[:300]
