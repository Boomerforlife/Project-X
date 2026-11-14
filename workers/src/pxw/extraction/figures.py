"""Figure capture: images / vector-drawing clusters inside a question's page band -> 200 dpi PNG crops."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from pxw.common.hashing import sha256_hex
from pxw.common.jsonio import atomic_write_bytes
from pxw.extraction.pdf import OCR_DPI, open_pdf
from pxw.storage import keys

MIN_SIDE = 20.0
MAX_PAGE_FRACTION = 0.85
PAD = 4.0


def _union(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))


def _intersects(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def page_figure_rects(page: Any) -> list[tuple[tuple[float, float, float, float], str]]:
    area = page.rect.width * page.rect.height
    cands: list[tuple[tuple[float, float, float, float], str]] = []
    for info in page.get_image_info():
        r = tuple(float(v) for v in info["bbox"])
        cands.append((r, "IMAGE"))  # type: ignore[arg-type]
    for r in page.cluster_drawings():
        cands.append(((float(r.x0), float(r.y0), float(r.x1), float(r.y1)), "DIAGRAM"))
    keep: list[tuple[tuple[float, float, float, float], str]] = []
    for r, kind in cands:
        w, h = r[2] - r[0], r[3] - r[1]
        if w < MIN_SIDE or h < MIN_SIDE or (w * h) > MAX_PAGE_FRACTION * area:
            continue
        keep.append((r, kind))
    # merge overlapping rects
    merged: list[tuple[tuple[float, float, float, float], str]] = []
    for r, kind in sorted(keep, key=lambda t: (t[0][1], t[0][0])):
        for i, (mr, mk) in enumerate(merged):
            if _intersects(r, mr):
                merged[i] = (_union(r, mr), "DIAGRAM" if "DIAGRAM" in (kind, mk) else "IMAGE")
                break
        else:
            merged.append((r, kind))
    return merged


def capture_figures(
    pdf_path: str | Path,
    questions: list[dict[str, Any]],
    source_document_id: str,
    crops_dir: Path,
) -> dict[str, list[dict[str, Any]]]:
    """Returns {question_number: [asset dict]}; PNGs written to crops_dir (deterministic names)."""
    doc = open_pdf(pdf_path)
    result: dict[str, list[dict[str, Any]]] = {q["number"]: [] for q in questions}
    try:
        for page_idx in range(doc.page_count):
            page_no = str(page_idx + 1)
            owners = [q for q in questions if page_no in q["bands"]]
            if not owners:
                continue
            page = doc[page_idx]
            for rect, kind in page_figure_rects(page):
                cy = (rect[1] + rect[3]) / 2
                for q in owners:
                    top, bottom = q["bands"][page_no]
                    if bottom < 0:
                        bottom = float(page.rect.height)
                    if top <= cy <= bottom:
                        n = len(result[q["number"]]) + 1
                        key = keys.derived_crop(source_document_id, q["number"], n)
                        clip = _clip(page, rect)
                        png = page.get_pixmap(clip=clip, dpi=OCR_DPI, alpha=False).tobytes("png")
                        fname = key.rsplit("/", 1)[-1]
                        atomic_write_bytes(crops_dir / fname, png)
                        result[q["number"]].append(
                            {
                                "asset_ref": f"q{_ref(q['number'])}-fig{n}",
                                "kind": kind,
                                "page": page_idx + 1,
                                "bbox": [round(v, 2) for v in rect],
                                "sha256": sha256_hex(png),
                                "mime_type": "image/png",
                                "width": _png_size(png)[0],
                                "height": _png_size(png)[1],
                                "bytes": len(png),
                                "r2_key": key,
                                "file": fname,
                            }
                        )
                        break
    finally:
        doc.close()
    return result


def _ref(number: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", number) or "x"


def _clip(page: Any, rect: tuple[float, float, float, float]) -> Any:
    import pymupdf

    r = pymupdf.Rect(rect[0] - PAD, rect[1] - PAD, rect[2] + PAD, rect[3] + PAD)
    return r & page.rect


def _png_size(png: bytes) -> tuple[int, int]:
    # IHDR: width/height are big-endian uint32 at byte offsets 16 and 20
    return int.from_bytes(png[16:20], "big"), int.from_bytes(png[20:24], "big")
