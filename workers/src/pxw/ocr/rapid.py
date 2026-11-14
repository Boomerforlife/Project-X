"""RapidOCR (ONNX) engine; imports are lazy."""

from __future__ import annotations

import io
from typing import Any

from pxw.ocr.base import OcrLine, OcrResult, mean_conf


class RapidOcrEngine:
    name = "rapidocr"

    def __init__(self) -> None:
        self._engine: Any = None

    def available(self) -> bool:
        import importlib.util

        try:
            return importlib.util.find_spec("rapidocr") is not None
        except (ImportError, ValueError):
            return False

    def recognize(self, png: bytes, *, lang: str = "en") -> OcrResult:
        import numpy as np
        from PIL import Image

        if self._engine is None:
            from rapidocr import RapidOCR

            self._engine = RapidOCR()
        img = np.array(Image.open(io.BytesIO(png)).convert("RGB"))[:, :, ::-1]  # RGB -> BGR
        out = self._engine(img)
        boxes = getattr(out, "boxes", None)
        txts = getattr(out, "txts", None)
        scores = getattr(out, "scores", None)
        lines: list[OcrLine] = []
        if boxes is not None and txts is not None:
            scs = scores if scores is not None else [1.0] * len(txts)
            for box, txt, sc in zip(boxes, txts, scs, strict=False):
                xs = [float(p[0]) for p in box]
                ys = [float(p[1]) for p in box]
                lines.append(OcrLine(str(txt), (min(xs), min(ys), max(xs), max(ys)), float(sc)))
        return OcrResult(engine=self.name, lines=lines, mean_confidence=mean_conf(lines))
