"""PDF text extraction (PyMuPDF): per-page lines with bbox/font, text coverage, OCR need, page rendering."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

OCR_MIN_CHARS = 50
OCR_MAX_NON_ASCII = 0.30
OCR_DPI = 200


def open_pdf(path: str | Path) -> Any:
    import pymupdf

    return pymupdf.open(str(path))


def order_lines(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reading order: page, then rows (y clustering with half-line tolerance), then x."""
    out: list[dict[str, Any]] = []
    by_page: dict[int, list[dict[str, Any]]] = {}
    for ln in lines:
        by_page.setdefault(ln["page"], []).append(ln)
    for page in sorted(by_page):
        items = sorted(by_page[page], key=lambda ln: (ln["bbox"][1], ln["bbox"][0]))
        rows: list[list[dict[str, Any]]] = []
        for ln in items:
            h = max(ln["bbox"][3] - ln["bbox"][1], 1.0)
            if rows and abs(ln["bbox"][1] - rows[-1][0]["bbox"][1]) <= 0.5 * h:
                rows[-1].append(ln)
            else:
                rows.append([ln])
        for row in rows:
            out.extend(sorted(row, key=lambda ln: ln["bbox"][0]))
    return out


def page_lines(page: Any, page_no: int) -> list[dict[str, Any]]:
    d = page.get_text("dict")
    lines: list[dict[str, Any]] = []
    for block in d.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            text = "".join(s.get("text", "") for s in spans).strip()
            if not text:
                continue
            biggest = max(spans, key=lambda s: s.get("size", 0.0))
            lines.append(
                {
                    "page": page_no,
                    "text": text,
                    "bbox": [round(float(v), 2) for v in line["bbox"]],
                    "source": "TEXT",
                    "conf": None,
                    "size": round(float(biggest.get("size", 0.0)), 2),
                    "font": biggest.get("font", ""),
                }
            )
    return order_lines(lines)


def non_ascii_ratio(text: str) -> float:
    if not text:
        return 0.0
    bad = sum(1 for c in text if ord(c) > 127 or c == "�")
    bad += 5 * len(re.findall(r"\(cid:\d+\)", text))
    return min(1.0, bad / max(len(text), 1))


def extract_pages(pdf_path: str | Path) -> dict[str, Any]:
    doc = open_pdf(pdf_path)
    try:
        pages: list[dict[str, Any]] = []
        for i in range(doc.page_count):
            page = doc[i]
            no = i + 1
            lines = page_lines(page, no)
            text = " ".join(ln["text"] for ln in lines)
            n_chars = len(text)
            ratio = non_ascii_ratio(text)
            area = max(page.rect.width * page.rect.height, 1.0)
            covered = sum((ln["bbox"][2] - ln["bbox"][0]) * (ln["bbox"][3] - ln["bbox"][1]) for ln in lines)
            has_images = len(page.get_image_info()) > 0
            has_drawings = False
            if n_chars < OCR_MIN_CHARS and not has_images:
                has_drawings = len(page.get_drawings()) > 0
            blank = n_chars == 0 and not has_images and not has_drawings
            needs = (not blank) and (n_chars < OCR_MIN_CHARS or ratio > OCR_MAX_NON_ASCII)
            pages.append(
                {
                    "page": no,
                    "width": round(float(page.rect.width), 2),
                    "height": round(float(page.rect.height), 2),
                    "n_chars": n_chars,
                    "non_ascii_ratio": round(ratio, 4),
                    "coverage": round(min(1.0, covered / area), 4),
                    "has_images": has_images,
                    "needs_ocr": needs,
                    "lines": lines,
                }
            )
        return {"page_count": doc.page_count, "pages": pages}
    finally:
        doc.close()


def render_page_png(doc: Any, page_index: int, dpi: int = OCR_DPI) -> bytes:
    pix = doc[page_index].get_pixmap(dpi=dpi, alpha=False)
    return pix.tobytes("png")
