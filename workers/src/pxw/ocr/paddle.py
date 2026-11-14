"""PaddleOCR engine (optional extra `paddle`); imports are lazy."""

from __future__ import annotations

import io
from typing import Any

from pxw.ocr.base import OcrLine, OcrResult, mean_conf


class PaddleOcrEngine:
    name = "paddle"

    def __init__(self) -> None:
        self._engine: Any = None

    def available(self) -> bool:
        import importlib.util

        try:
            return importlib.util.find_spec("paddleocr") is not None
        except (ImportError, ValueError):
            return False

    def recognize(self, png: bytes, *, lang: str = "en") -> OcrResult:
        import numpy as np
        from PIL import Image

        if self._engine is None:
            from paddleocr import PaddleOCR

            self._engine = PaddleOCR(lang=lang)
        img = np.array(Image.open(io.BytesIO(png)).convert("RGB"))
        result = self._engine.predict(img)
        lines: list[OcrLine] = []
        for page in result or []:
            texts = page.get("rec_texts", [])
            scores = page.get("rec_scores", [])
            polys = page.get("rec_polys", page.get("dt_polys", []))
            for txt, sc, poly in zip(texts, scores, polys, strict=False):
                xs = [float(p[0]) for p in poly]
                ys = [float(p[1]) for p in poly]
                lines.append(OcrLine(str(txt), (min(xs), min(ys), max(xs), max(ys)), float(sc)))
        return OcrResult(engine=self.name, lines=lines, mean_confidence=mean_conf(lines))
