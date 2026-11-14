"""Deterministic OCR engine for tests: fixtures keyed by sha256(png)."""

from __future__ import annotations

from pxw.common.hashing import sha256_hex
from pxw.ocr.base import OcrResult


class MockOcrEngine:
    name = "mock"

    def __init__(self, fixtures: dict[str, OcrResult] | None = None, default: OcrResult | None = None) -> None:
        self.fixtures = fixtures or {}
        self.default = default
        self.calls: list[str] = []

    def available(self) -> bool:
        return True

    def recognize(self, png: bytes, *, lang: str = "en") -> OcrResult:
        key = sha256_hex(png)
        self.calls.append(key)
        res = self.fixtures.get(key) or self.default
        if res is None:
            return OcrResult(engine=self.name, lines=[], mean_confidence=0.0)
        return res
