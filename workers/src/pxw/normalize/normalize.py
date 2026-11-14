"""Raw segmented questions -> NormalizedQuestion dicts (INGESTION_PIPELINE sections 3 and 6)."""

from __future__ import annotations

import re
from typing import Any

from pxw.common.models import NormalizedQuestion, Warning
from pxw.extraction.math_text import to_latex
from pxw.normalize.text import build_normalized_text, content_hash

_FIGURE_WORDS = re.compile(r"\b(figure|diagram|graph|circuit|shown below|shown in the)\b", re.IGNORECASE)
_MULTI = re.compile(r"one or more|more than one|multiple correct", re.IGNORECASE)


def normalize_question(
    raw: dict[str, Any],
    assets: list[dict[str, Any]],
    *,
    min_confidence: float,
    page_engines: dict[int, str] | None = None,
    page_warnings: dict[int, list[str]] | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    stem_raw = " ".join(s.strip() for s in raw["stem"] if s.strip()).strip()
    stem, unknown = to_latex(stem_raw)

    options: list[dict[str, Any]] = []
    opt_texts: list[tuple[str, str]] = []
    for o in sorted(raw["options"], key=lambda o: o["label"]):
        text_raw = " ".join(t.strip() for t in o["text"] if t.strip()).strip()
        text, unk = to_latex(text_raw)
        unknown += unk
        if not text:
            warnings.append(Warning.EMPTY_OPTION.value)
        options.append(
            {
                "label": o["label"],
                "external_option_id": o.get("external_option_id"),
                "content": [{"type": "paragraph", "text": text}],
            }
        )
        opt_texts.append((o["label"], text))

    if unknown:
        warnings.append(Warning.NEEDS_MATH_REVIEW.value)
    n_opt = len(options)
    if n_opt not in (0, 4) or (n_opt == 0 and raw.get("numerical_mode") is False):
        warnings.append(Warning.OPTION_COUNT_UNUSUAL.value)
    if not stem:
        warnings.append(Warning.EMPTY_QUESTION_TEXT.value)
    if not assets and _FIGURE_WORDS.search(stem):
        warnings.append(Warning.FIGURE_NOT_CAPTURED.value)

    if n_opt == 0:
        qtype = "NUMERICAL"
    elif _MULTI.search(stem):
        qtype = "MULTI_MCQ"
    else:
        qtype = "SINGLE_MCQ"

    content: list[dict[str, Any]] = [{"type": "paragraph", "text": stem}]
    for a in assets:
        content.append({"type": "image", "asset_ref": a["asset_ref"], "alt": ""})

    sources = {ln["source"] for ln in raw["lines"]}
    method = "TEXT" if sources == {"TEXT"} else ("OCR" if sources == {"OCR"} else "MIXED")
    confs = [ln["conf"] for ln in raw["lines"] if ln["source"] == "OCR" and ln.get("conf") is not None]
    mean_conf = round(sum(confs) / len(confs), 4) if confs else None
    pages = raw["pages"] or [1]
    engine = None
    if method != "TEXT" and page_engines:
        ocr_pages = [page_engines[p] for p in pages if p in page_engines]
        engine = ocr_pages[0] if ocr_pages else None
    if mean_conf is not None and mean_conf < min_confidence:
        warnings.append(Warning.OCR_LOW_CONFIDENCE.value)
    if page_warnings:
        for p in range(min(pages), max(pages) + 1):
            warnings.extend(page_warnings.get(p, []))

    normalized_text = build_normalized_text(stem, opt_texts)
    model = NormalizedQuestion(
        question_number=raw["number"],
        external_question_id=raw.get("external_question_id"),
        section_hint=raw.get("section_hint"),
        question_type_guess=qtype,
        content=content,
        options=options,
        assets=[
            {
                "asset_ref": a["asset_ref"],
                "asset_id": None,
                "kind": a["kind"],
                "page": a["page"],
                "bbox": a["bbox"],
                "sha256": a["sha256"],
                "mime_type": a["mime_type"],
                "width": a["width"],
                "height": a["height"],
                "r2_key": a["r2_key"],
            }
            for a in assets
        ],
        page_start=min(pages),
        page_end=max(pages),
        question_text=stem,
        normalized_text=normalized_text,
        content_hash=content_hash(normalized_text),
        extraction={
            "method": method,
            "ocr_engine": engine,
            "mean_confidence": mean_conf,
            "warnings": list(dict.fromkeys(warnings)),
        },
    )
    return model.model_dump(mode="json")


def normalize_all(
    raws: list[dict[str, Any]],
    assets_by_number: dict[str, list[dict[str, Any]]],
    **kwargs: Any,
) -> list[dict[str, Any]]:
    out = [normalize_question(r, assets_by_number.get(r["number"], []), **kwargs) for r in raws]
    seen_ids: set[str] = set()
    result: list[dict[str, Any]] = []
    for q in out:
        ext = q["external_question_id"]
        if ext is not None:
            if ext in seen_ids:
                q["external_question_id"] = None
                q["extraction"]["warnings"].append(Warning.DUPLICATE_EXTERNAL_ID.value)
            seen_ids.add(ext)
        result.append(q)
    return result
