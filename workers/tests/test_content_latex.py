r"""Content import: structural LaTeX checker and ContentBlock splitting."""

from __future__ import annotations

import pytest

from pxw.content.latex import blocks_to_text, check_latex, split_blocks


def codes(text: str) -> list[str]:
    return [i.code for i in check_latex(text)]


@pytest.mark.parametrize(
    "good",
    [
        "plain text, no math",
        r"inline $x^2 + \frac{1}{2}$ and \(\sqrt{3}\) here",
        r"display $$\int_0^1 x\,dx = \frac12$$ then \[ \frac{a}{b} \]",
        r"escaped dollar costs \$5 and a $y$",
        r"$\frac12$ single-token args are fine, $\frac{a}{\sqrt{b}}$",
        r"$\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}$",
        r"$\left( \frac{a}{b} \right)$ and $\{a, b\}$ and $a \\[2pt] b$",
        r"$$\begin{aligned} a &= 1 \\ b &= 2 \end{aligned}$$",
    ],
)
def test_good_latex_has_no_issues(good):
    assert check_latex(good) == []


@pytest.mark.parametrize(
    ("bad", "code"),
    [
        ("costs $5 only", "UNCLOSED_MATH"),
        ("$$ a + b $", "UNCLOSED_MATH"),
        (r"\( a + b", "UNCLOSED_MATH"),
        (r"\[ a + b", "UNCLOSED_MATH"),
        (r"closing \) alone", "DELIMITER"),
        (r"closing \] alone", "DELIMITER"),
        (r"\( a $ b $ \)", "NESTED_MATH"),
        (r"\( a \( b \)", "NESTED_MATH"),
        (r"\( a \]", "DELIMITER"),
        (r"$$ a $ b $$", "DELIMITER"),
        (r"$\frac{a}{b$", "BRACES"),
        (r"$a}$", "BRACES"),
        (r"$\frac{a}$", "FRAC_ARGS"),
        (r"$\dfrac$", "FRAC_ARGS"),
        (r"$\binom{n}$", "FRAC_ARGS"),
        (r"$\begin{pmatrix} 1 & 2 \end{bmatrix}$", "ENV_MISMATCH"),
        (r"$\begin{pmatrix} 1$", "ENV_MISMATCH"),
        (r"$1 \end{pmatrix}$", "ENV_MISMATCH"),
        (r"$\begin{foo} 1 \end{foo}$", "UNKNOWN_ENV"),
        (r"$\left( a$", "LEFT_RIGHT"),
        (r"\begin{pmatrix} 1 \end{pmatrix} outside", "ENV_OUTSIDE_MATH"),
    ],
)
def test_bad_latex_is_reported(bad, code):
    assert code in codes(bad)


def test_escaped_braces_are_not_counted():
    assert check_latex(r"$\{ a \}$ and $\left\{ x \right\}$") == []


def test_split_blocks_display_math_and_paragraphs():
    blocks = split_blocks("Find $x$.\n\nThen compute $$x^2 = 4$$ and more \\[ y = 1 \\] end")
    assert blocks == [
        {"type": "paragraph", "text": "Find $x$."},
        {"type": "paragraph", "text": "Then compute"},
        {"type": "math", "latex": "x^2 = 4"},
        {"type": "paragraph", "text": "and more"},
        {"type": "math", "latex": "y = 1"},
        {"type": "paragraph", "text": "end"},
    ]


def test_split_blocks_plain_and_escaped_dollar():
    assert split_blocks(r"costs \$5 and \$6") == [{"type": "paragraph", "text": r"costs \$5 and \$6"}]


def test_blocks_to_text_mirrors_db_function():
    blocks = [{"type": "paragraph", "text": "A"}, {"type": "math", "latex": "x"}]
    assert blocks_to_text(blocks) == "A $x$"
