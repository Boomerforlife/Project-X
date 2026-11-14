from pxw.common.hashing import sha256_hex
from pxw.ocr.base import OcrLine, OcrResult
from pxw.ocr.chain import OcrChain, build_engines
from pxw.ocr.mock import MockOcrEngine


class Fake:
    def __init__(self, name, conf, available=True, raises=False):
        self.name, self.conf, self._avail, self.raises, self.calls = name, conf, available, raises, 0

    def available(self):
        return self._avail

    def recognize(self, png, *, lang="en"):
        self.calls += 1
        if self.raises:
            raise RuntimeError("boom")
        return OcrResult(self.name, [OcrLine(self.name, (0, 0, 1, 1), self.conf)], self.conf)


def test_first_available_engine_wins_when_confident():
    a, b, c = Fake("a", 0.9, available=False), Fake("b", 0.8), Fake("c", 0.99)
    chain = OcrChain([a, b, c], min_confidence=0.6)
    res = chain.recognize(b"x")
    assert res.engine == "b"
    assert (a.calls, b.calls, c.calls) == (0, 1, 0)
    assert chain.last_warnings == [] and chain.last_tried == ["b"]


def test_low_confidence_escalates_in_order():
    a, b = Fake("a", 0.3), Fake("b", 0.7)
    chain = OcrChain([a, b], min_confidence=0.6)
    assert chain.recognize(b"x").engine == "b"
    assert chain.last_tried == ["a", "b"]


def test_all_low_keeps_best_and_warns():
    chain = OcrChain([Fake("a", 0.3), Fake("b", 0.5), Fake("c", 0.4)], min_confidence=0.6)
    res = chain.recognize(b"x")
    assert res.engine == "b" and res.mean_confidence == 0.5
    assert chain.last_warnings == ["OCR_LOW_CONFIDENCE"]


def test_none_available_gives_ocr_unavailable():
    chain = OcrChain([Fake("a", 0.9, available=False)], min_confidence=0.6)
    res = chain.recognize(b"x")
    assert (res.engine, res.lines, res.mean_confidence) == ("none", [], 0)
    assert chain.last_warnings == ["OCR_UNAVAILABLE"]
    assert OcrChain([]).recognize(b"x").engine == "none"


def test_crashing_engine_is_skipped():
    chain = OcrChain([Fake("a", 0.9, raises=True), Fake("b", 0.8)], 0.6)
    assert chain.recognize(b"x").engine == "b"


def test_mock_engine_fixtures_keyed_by_sha256():
    png = b"\x89PNG fake"
    fx = OcrResult("mock", [OcrLine("hello", (0, 0, 5, 5), 0.9)], 0.9)
    eng = MockOcrEngine({sha256_hex(png): fx})
    assert eng.recognize(png) is fx
    assert eng.recognize(b"other").lines == []


def test_build_engines_is_lazy_and_validates_names():
    engines = build_engines(["rapidocr", "paddle", "tesseract", "mock"])
    assert [e.name for e in engines] == ["rapidocr", "paddle", "tesseract", "mock"]
    try:
        build_engines(["nope"])
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError")
