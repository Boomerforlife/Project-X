"""Tesseract engine (optional extra `tesseract`, needs the tesseract binary); imports are lazy."""

from __future__ import annotations

import io

from pxw.ocr.base import OcrLine, OcrResult, mean_conf


class TesseractOcrEngine:
    name = "tesseract"

    def available(self) -> bool:
        try:
            import pytesseract

            pytesseract.get_tesseract_version()
            return True
        except Exception:  # noqa: BLE001 - missing binary/package => unavailable
            return False

    def recognize(self, png: bytes, *, lang: str = "en") -> OcrResult:
        import pytesseract
        from PIL import Image

        tess_lang = {"en": "eng"}.get(lang, lang)
        data = pytesseract.image_to_data(
            Image.open(io.BytesIO(png)), lang=tess_lang, output_type=pytesseract.Output.DICT
        )
        rows: dict[tuple[int, int, int], list[int]] = {}
        for i, txt in enumerate(data["text"]):
            if not str(txt).strip() or float(data["conf"][i]) < 0:
                continue
            rows.setdefault((data["block_num"][i], data["par_num"][i], data["line_num"][i]), []).append(i)
        lines: list[OcrLine] = []
        for idxs in rows.values():
            text = " ".join(str(data["text"][i]).strip() for i in idxs)
            x0 = min(data["left"][i] for i in idxs)
            y0 = min(data["top"][i] for i in idxs)
            x1 = max(data["left"][i] + data["width"][i] for i in idxs)
            y1 = max(data["top"][i] + data["height"][i] for i in idxs)
            conf = sum(float(data["conf"][i]) for i in idxs) / len(idxs) / 100.0
            lines.append(OcrLine(text, (float(x0), float(y0), float(x1), float(y1)), conf))
        return OcrResult(engine=self.name, lines=lines, mean_confidence=mean_conf(lines))
