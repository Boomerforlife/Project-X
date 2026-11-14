from pxw.extraction.math_text import find_unknown_glyphs, to_latex


def test_superscripts_and_inline_wrap():
    out, unk = to_latex("Solve x² + 3x = 5 now")
    assert out == "Solve $x^{2} + 3x = 5$ now"
    assert unk == []


def test_sqrt_forms():
    assert to_latex("√2")[0] == "$\\sqrt{2}$"
    assert to_latex("√(x+1)")[0] == "$\\sqrt{x+1}$"


def test_greek_and_relations():
    out, unk = to_latex("angle θ ≤ 90°")
    assert "\\theta" in out and "\\leq" in out and "^\\circ" in out
    assert unk == []
    assert to_latex("A → B")[0].count("\\rightarrow") == 1


def test_command_followed_by_letter_gets_space():
    out, _ = to_latex("2πr")
    assert "\\pi r" in out


def test_integral_sum_pi_cubed():
    out, unk = to_latex("∫ x³ dx and Σ n")
    assert "\\int" in out and "x^{3}" in out and "\\sum" in out
    assert unk == []


def test_trailing_punctuation_stays_outside_math():
    out, _ = to_latex("Find π.")
    assert out == "Find $\\pi$."


def test_plain_text_untouched():
    text = "A body of mass 2 kg moves at 3 m/s."
    assert to_latex(text) == (text, [])


def test_unknown_glyphs_are_reported():
    _, unk = to_latex("value ⧉ here")
    assert unk == ["⧉"]
    assert find_unknown_glyphs("a (cid:123) b") == ["(cid:)"]
    assert find_unknown_glyphs("café") == []
