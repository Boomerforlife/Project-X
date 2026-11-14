"""Synthetic fixture PDFs, generated programmatically. SYNTHETIC CONTENT ONLY -- no real exam material.

Every page carries the footer "SYNTHETIC FIXTURE - not real exam content".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pymupdf

FOOTER = "SYNTHETIC FIXTURE - not real exam content"
_MARGIN_X = 72.0
_TOP = 72.0
_BOTTOM = 760.0
_LINE = 16.0

# (section, text, options, numerical)  -- deliberately distinct wording so near-duplicate detection stays quiet
QUESTIONS: list[dict[str, Any]] = [
    {"section": "Physics", "text": "A synthetic cart of mass 4 kg rolls at 3 m/s along a level track. What is its kinetic energy in joules?",
     "options": ["6", "12", "18", "24"]},
    {"section": "Physics", "text": "The synthetic curve y = 2x² passes through x = 1. Which value of y results there?",
     "options": ["1", "2", "4", "8"]},
    {"section": "Physics", "text": "Refer to the synthetic figure drawn below this sentence. Which plane shape does it show?",
     "options": ["square", "rectangle", "circle", "triangle"], "figure": True},
    {"section": "Chemistry", "text": "Pick the noble gas among these invented flask labels: neon, sodium, chlorine, carbon.",
     "options": ["neon", "sodium", "chlorine", "carbon"]},
    {"section": "Mathematics", "text": "For a synthetic triangle with a 90° corner how many right angles does a rectangle contain?",
     "options": ["1", "2", "3", "4"]},
    {"section": "Mathematics", "text": "Count the vertices of a synthetic cube and enter the integer.", "numerical": True},
    {"section": "Mathematics", "text": "Enter the whole number of days in a synthetic leap year used by the fixture calendar.",
     "numerical": True},
]


# Replacement questions with non-Latin-1 math glyphs (embeds a ~1.7 MB font; opt in via unicode_math=True)
UNICODE_QUESTIONS: dict[int, dict[str, Any]] = {
    1: {"section": "Physics", "text": "The synthetic quadratic x² + 3x − 5 = 0 has a positive root. Which expression gives it?",
        "options": ["(−3 + √29)/2", "(3 + √29)/2", "(−3 − √29)/2", "5/3"]},
    4: {"section": "Mathematics", "text": "For a synthetic triangle with angle θ ≤ 90° how many right angles does a rectangle contain?",
        "options": ["1", "2", "3", "4"]},
}


@dataclass
class SyntheticDoc:
    pdf: bytes
    n_questions: int
    layout: str
    #: page number (1-based) -> [(text, (x0, y0, x1, y1) in PDF points)] for image-only pages (feed to MockOcrEngine)
    ocr_pages: dict[int, list[tuple[str, tuple[float, float, float, float]]]] = field(default_factory=dict)
    figure_questions: list[str] = field(default_factory=list)


def _is_latin1(text: str) -> bool:
    try:
        text.encode("latin-1")
        return True
    except UnicodeEncodeError:
        return False


class _Page:
    """A page under construction that records each line's position."""

    def __init__(self, doc: pymupdf.Document) -> None:
        self.page = doc.new_page(width=595, height=842)
        self.y = _TOP
        self.records: list[tuple[str, tuple[float, float, float, float]]] = []
        self.png: bytes = b""

    def put(self, text: str, x: float = _MARGIN_X, *, advance: bool = True) -> None:
        latin1 = _is_latin1(text)
        w = pymupdf.get_text_length(text, fontsize=11) if latin1 else 7.0 * len(text)
        if latin1:
            self.page.insert_text((x, self.y), text, fontsize=11)
        else:
            tw = pymupdf.TextWriter(self.page.rect)
            tw.append((x, self.y), text, font=pymupdf.Font("cjk"), fontsize=11)
            tw.write_text(self.page)
        self.records.append((text, (x, self.y - 10, x + w, self.y + 3)))
        if advance:
            self.y += _LINE

    def footer(self) -> None:
        self.page.insert_text((_MARGIN_X, 810), FOOTER, fontsize=8)


def _layout_page_content(
    pg: _Page, items: list[tuple[int, dict[str, Any]]], layout: str, state: dict[str, Any], figures_on: list[str]
) -> list[tuple[int, dict[str, Any]]]:
    """Write as many items as fit on the page; return the remaining items."""
    done = 0
    for num, q in items:
        need = 8 + (10 if q.get("figure") else 0)
        if pg.y + need * _LINE > _BOTTOM:
            break
        if state.get("section") != q["section"]:
            pg.put(f"Section : {q['section']}" if layout == "nta_cbt_v1" else q["section"].upper())
            state["section"] = q["section"]
        if layout == "nta_cbt_v1":
            if q.get("numerical") and not state.get("numeric_header"):
                pg.put("Section B (Numerical)")
                state["numeric_header"] = True
            pg.put(f"Q.{num} {q['text']}")
        else:
            pg.put(f"{num}. {q['text']}")
        if q.get("figure"):
            r = pymupdf.Rect(_MARGIN_X + 20, pg.y, _MARGIN_X + 140, pg.y + 70)
            pg.page.draw_rect(r, width=1.5)
            pg.page.draw_line((r.x0, r.y0), (r.x1, r.y1), width=1)
            pg.page.draw_circle((r.x0 + 60, r.y0 + 35), 12, width=1)
            pg.y += 90
            figures_on.append(str(num))
        opts = q.get("options") or []
        if layout == "nta_cbt_v1":
            for i, o in enumerate(opts, 1):
                pg.put(f"({i}) {o}")
            if q.get("numerical"):
                pg.put("Given Answer : ______")
            pg.put(f"Question ID : {4054550000 + num * 10}")
            for i in range(len(opts)):
                pg.put(f"Option {i + 1} ID : {4054550000 + num * 10 + i + 1}")
        else:
            if len(opts) == 4:
                pg.put(f"(A) {opts[0]}", advance=False)
                pg.put(f"(B) {opts[1]}", x=_MARGIN_X + 200)
                pg.put(f"(C) {opts[2]}   (D) {opts[3]}")
            pg.y += 4
        done += 1
    return items[done:]


def make_question_pdf(
    layout: str = "nta_cbt_v1",
    n_questions: int = 6,
    *,
    image_only_page: int | None = None,
    with_footer: bool = True,
    unicode_math: bool = False,
) -> SyntheticDoc:
    """Build a synthetic question paper.

    `image_only_page` (1-based): that page is rasterised into an image (no text layer) so it needs OCR;
    `SyntheticDoc.ocr_pages` then carries the true text/bboxes so tests can build a MockOcrEngine fixture.
    """
    if layout not in ("nta_cbt_v1", "generic_numbered"):
        raise ValueError(layout)
    pool = [UNICODE_QUESTIONS.get(i, q) if unicode_math else q for i, q in enumerate(QUESTIONS)]
    items = [(i + 1, pool[i % len(pool)]) for i in range(n_questions)]
    src = pymupdf.open()
    state: dict[str, Any] = {}
    figures_on: list[str] = []
    pages: list[_Page] = []
    while items:
        pg = _Page(src)
        remaining = _layout_page_content(pg, items, layout, state, figures_on)
        if len(remaining) == len(items):
            raise RuntimeError("synthetic content does not fit on a page")
        items = remaining
        if with_footer:
            pg.footer()
        if image_only_page == len(pages) + 1:  # render now: page objects are invalidated by later new_page calls
            pg.png = pg.page.get_pixmap(dpi=200, alpha=False).tobytes("png")
        pages.append(pg)
    ocr_pages: dict[int, list[tuple[str, tuple[float, float, float, float]]]] = {}
    out = pymupdf.open()
    for idx, pg in enumerate(pages, 1):
        if image_only_page == idx:
            np_ = out.new_page(width=595, height=842)
            np_.insert_image(np_.rect, stream=pg.png)
            ocr_pages[idx] = pg.records
        else:
            out.insert_pdf(src, from_page=idx - 1, to_page=idx - 1)
    data = out.tobytes(garbage=4, deflate=True, deflate_fonts=True)
    out.close()
    src.close()
    return SyntheticDoc(pdf=data, n_questions=n_questions, layout=layout, ocr_pages=ocr_pages, figure_questions=figures_on)


def make_answer_key_pdf(rows: list[str], title: str = "SYNTHETIC ANSWER KEY (fixture)") -> bytes:
    """One text line per entry in `rows` (e.g. '1 B', '3 2.4 to 2.6', '5 4054551234 4054558901')."""
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((_MARGIN_X, _TOP), title, fontsize=12)
    y = _TOP + 30
    for r in rows:
        if y > _BOTTOM:
            page = doc.new_page(width=595, height=842)
            y = _TOP
        page.insert_text((_MARGIN_X, y), r, fontsize=11)
        y += _LINE
    data = doc.tobytes()
    doc.close()
    return data
