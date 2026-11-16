"""OcrChain: first available engine; escalate to the next on low confidence; keep the best."""

from __future__ import annotations

from pxw.common.models import Warning
from pxw.ocr.base import OcrEngine, OcrResult
from pxw.ocr.mock import MockOcrEngine
from pxw.ocr.paddle import PaddleOcrEngine
from pxw.ocr.rapid import RapidOcrEngine
from pxw.ocr.tesseract import TesseractOcrEngine


def build_engines(names: list[str], *, mock: MockOcrEngine | None = None) -> list[OcrEngine]:
    engines: list[OcrEngine] = []
    for n in names:
        key = n.strip().lower()
        if key == "rapidocr":
            engines.append(RapidOcrEngine())
        elif key == "paddle":
            engines.append(PaddleOcrEngine())
        elif key == "tesseract":
            engines.append(TesseractOcrEngine())
        elif key == "none":
            continue  # explicit: no OCR (images are shown as-is; OCR can enrich later)
        elif key == "mock":
            engines.append(mock or MockOcrEngine())
        elif key:
            raise ValueError(f"unknown OCR engine {n!r} (rapidocr|paddle|tesseract|mock|none)")
    return engines


class OcrChain:
    name = "chain"

    def __init__(self, engines: list[OcrEngine], min_confidence: float = 0.6) -> None:
        self.engines = engines
        self.min_confidence = min_confidence
        self.last_warnings: list[str] = []
        self.last_tried: list[str] = []

    def available(self) -> bool:
        return any(e.available() for e in self.engines)

    def recognize(self, png: bytes, *, lang: str = "en") -> OcrResult:
        """Returns the first result with mean_confidence >= min, else the best seen.

        Sets `last_warnings` (OCR_UNAVAILABLE when no engine ran, OCR_LOW_CONFIDENCE when best < min)
        and `last_tried` (engine names, in order, that were attempted).
        """
        warnings: list[str] = []
        tried: list[str] = []
        best: OcrResult | None = None
        for eng in self.engines:
            if not eng.available():
                continue
            tried.append(eng.name)
            try:
                res = eng.recognize(png, lang=lang)
            except Exception:  # noqa: BLE001, S112 - an engine crash must not kill the document: try the next
                continue
            if best is None or res.mean_confidence > best.mean_confidence:
                best = res
            if res.mean_confidence >= self.min_confidence:
                self.last_warnings, self.last_tried = warnings, tried
                return res
        if best is None:
            warnings.append(Warning.OCR_UNAVAILABLE.value)
            best = OcrResult(engine="none", lines=[], mean_confidence=0.0)
        else:
            warnings.append(Warning.OCR_LOW_CONFIDENCE.value)
        self.last_warnings, self.last_tried = warnings, tried
        return best
