r"""Unicode math -> inline LaTeX ($...$). Unknown glyphs are reported (-> NEEDS_MATH_REVIEW)."""

from __future__ import annotations

import re
import unicodedata

_SUP = {"⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
        "⁺": "+", "⁻": "-", "⁼": "=", "⁽": "(", "⁾": ")", "ⁿ": "n"}
_SUB = {"₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
        "₊": "+", "₋": "-", "₌": "=", "₍": "(", "₎": ")"}
_SUP_RE = re.compile("[" + "".join(_SUP) + "]+")
_SUB_RE = re.compile("[" + "".join(_SUB) + "]+")

# char -> (latex, is_operator)
_SYMBOLS: dict[str, tuple[str, bool]] = {
    "π": (r"\pi", False), "θ": (r"\theta", False), "α": (r"\alpha", False), "β": (r"\beta", False),
    "γ": (r"\gamma", False), "δ": (r"\delta", False), "ε": (r"\epsilon", False), "λ": (r"\lambda", False),
    "μ": (r"\mu", False), "ν": (r"\nu", False), "ρ": (r"\rho", False), "σ": (r"\sigma", False),
    "τ": (r"\tau", False), "φ": (r"\phi", False), "ω": (r"\omega", False), "Δ": (r"\Delta", False),
    "Ω": (r"\Omega", False), "Σ": (r"\sum", False), "∑": (r"\sum", False), "∏": (r"\prod", False),
    "Φ": (r"\Phi", False), "Γ": (r"\Gamma", False), "Π": (r"\Pi", False), "Θ": (r"\Theta", False),
    "∫": (r"\int", False), "∮": (r"\oint", False), "∂": (r"\partial", False), "∇": (r"\nabla", False),
    "∞": (r"\infty", False), "°": (r"^\circ", False),
    "≤": (r"\leq", True), "≥": (r"\geq", True), "≠": (r"\neq", True), "≈": (r"\approx", True),
    "→": (r"\rightarrow", True), "⇒": (r"\Rightarrow", True), "⇌": (r"\rightleftharpoons", True),
    "←": (r"\leftarrow", True), "↔": (r"\leftrightarrow", True), "×": (r"\times", True), "÷": (r"\div", True),
    "±": (r"\pm", True), "∓": (r"\mp", True), "·": (r"\cdot", True), "∝": (r"\propto", True), "∈": (r"\in", True),
    "∴": (r"\therefore", True), "−": ("-", True), "∥": (r"\parallel", True), "⊥": (r"\perp", True),
    "∠": (r"\angle", False),
}
_FRACTIONS = {"½": r"\frac{1}{2}", "¼": r"\frac{1}{4}", "¾": r"\frac{3}{4}", "⅓": r"\frac{1}{3}", "⅔": r"\frac{2}{3}"}
_ALLOWED_PLAIN = set("’‘“”–—…•‐\u00a0\u2009\u200b\u00ad€£¢©®™§¶")

_CMD_RE = re.compile(r"\\[A-Za-z]+|[\^_]\{")
_OP_RE = re.compile(r"^[=+\-*/<>~]+$")
_TERM_RE = re.compile(r"^[\w.()\[\]^{}\\,:/-]+$")
_CID_RE = re.compile(r"\(cid:\d+\)")


def _sqrt(text: str) -> str:
    text = re.sub(r"√\s*\(([^()]*)\)", r"\\sqrt{\1}", text)
    text = re.sub(r"√\s*([A-Za-z0-9.]+)", r"\\sqrt{\1}", text)
    return text.replace("√", r"\sqrt{}")


def _convert_word(w: str) -> str:
    w = _SUP_RE.sub(lambda m: "^{" + "".join(_SUP[c] for c in m.group()) + "}", w)
    w = _SUB_RE.sub(lambda m: "_{" + "".join(_SUB[c] for c in m.group()) + "}", w)
    w = _sqrt(w)
    for ch, lx in _FRACTIONS.items():
        w = w.replace(ch, lx)
    out: list[str] = []
    for i, ch in enumerate(w):
        sym = _SYMBOLS.get(ch)
        if sym is None:
            out.append(ch)
            continue
        latex = sym[0]
        nxt = w[i + 1] if i + 1 < len(w) else ""
        # a command followed by a letter would merge into a different command: separate with a space
        if latex.startswith("\\") and latex[-1].isalpha() and nxt and (nxt.isalnum()):
            latex += " "
        out.append(latex)
    return "".join(out)


def find_unknown_glyphs(text: str) -> list[str]:
    """Characters that survive conversion but are not plain letters/digits/punctuation (math symbols we cannot map)."""
    unknown: list[str] = []
    if _CID_RE.search(text):
        unknown.append("(cid:)")
    for ch in text:
        if ord(ch) < 128 or ch in _ALLOWED_PLAIN or ch in _SYMBOLS or ch in _SUP or ch in _SUB or ch in _FRACTIONS:
            continue
        if ch == "√":
            continue
        cat = unicodedata.category(ch)
        if cat[0] in ("L", "N", "Z", "M") or cat in ("Pd", "Pi", "Pf", "Po", "Ps", "Pe", "Pc", "Sc"):
            continue
        if ch not in unknown:
            unknown.append(ch)
    return unknown


def _is_term(word: str) -> bool:
    return bool(_TERM_RE.match(word)) and len(word) <= 16 and (len(word) <= 2 or any(c.isdigit() for c in word))


def to_latex(text: str) -> tuple[str, list[str]]:
    """Convert unicode math in `text`; returns (text with inline $LaTeX$, unknown glyphs found)."""
    unknown = find_unknown_glyphs(text)
    parts = re.split(r"(\s+)", text)
    idx = [i for i, p in enumerate(parts) if p and not p.isspace()]
    words = [_convert_word(parts[i]) for i in idx]
    flags = [bool(_CMD_RE.search(w)) for w in words]
    n = len(words)
    changed = True
    while changed:
        changed = False
        for k in range(n):
            if not flags[k]:
                continue
            # operator-like latex command (\leq, \times ...) pulls in its neighbours
            if words[k].startswith("\\") and words[k] in {s[0] for s in _SYMBOLS.values() if s[1]}:
                for j in (k - 1, k + 1):
                    if 0 <= j < n and not flags[j] and _is_term(words[j]):
                        flags[j] = True
                        changed = True
            if k + 2 < n and _OP_RE.match(words[k + 1]) and not flags[k + 1] and _is_term(words[k + 2]):
                flags[k + 1] = flags[k + 2] = True
                changed = True
            if k - 2 >= 0 and _OP_RE.match(words[k - 1]) and not flags[k - 1] and _is_term(words[k - 2]):
                flags[k - 1] = flags[k - 2] = True
                changed = True
    if not any(flags):
        return text, unknown
    out: list[str] = []
    k = 0
    pi = 0  # position in parts
    while pi < len(parts):
        if not parts[pi] or parts[pi].isspace():
            out.append(parts[pi])
            pi += 1
            continue
        wi = idx.index(pi)
        if not flags[wi]:
            out.append(parts[pi])
            pi += 1
            continue
        # gather a run of flagged words separated only by whitespace
        run_parts = [words[wi]]
        end_pi = pi
        nxt_wi = wi + 1
        while nxt_wi < n and flags[nxt_wi] and idx[nxt_wi] == end_pi + 2:
            run_parts.append(parts[end_pi + 1])
            run_parts.append(words[nxt_wi])
            end_pi = idx[nxt_wi]
            nxt_wi += 1
        body = "".join(run_parts)
        trail = ""
        m = re.search(r"[.,;:?!]+$", body)
        if m:
            trail, body = m.group(), body[: m.start()]
        out.append(f"${body}${trail}")
        pi = end_pi + 1
        k += 1
    return "".join(out), unknown
