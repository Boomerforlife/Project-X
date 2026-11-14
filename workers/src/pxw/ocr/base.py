"""OCR protocol and result types."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class OcrLine:
    text: str
    bbox: tuple[float, float, float, float]
    confidence: float


@dataclass
class OcrResult:
    engine: str
    lines: list[OcrLine] = field(default_factory=list)
    mean_confidence: float = 0.0

    def to_dict(self) -> dict:
        return {
            "engine": self.engine,
            "mean_confidence": self.mean_confidence,
            "lines": [{"text": ln.text, "bbox": list(ln.bbox), "confidence": ln.confidence} for ln in self.lines],
        }

    @classmethod
    def from_dict(cls, d: dict) -> OcrResult:
        lines = [
            OcrLine(ln["text"], tuple(ln["bbox"]), float(ln.get("confidence", 0.0)))  # type: ignore[arg-type]
            for ln in d.get("lines", [])
        ]
        return cls(engine=d["engine"], mean_confidence=float(d.get("mean_confidence", 0.0)), lines=lines)


class OcrEngine(Protocol):
    name: str

    def available(self) -> bool: ...

    def recognize(self, png: bytes, *, lang: str = "en") -> OcrResult: ...


def mean_conf(lines: list[OcrLine]) -> float:
    return sum(ln.confidence for ln in lines) / len(lines) if lines else 0.0
