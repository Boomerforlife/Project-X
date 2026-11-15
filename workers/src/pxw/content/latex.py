r"""Structural LaTeX checks (no external deps) and ContentBlock splitting.

Not a TeX parser: it catches the mistakes that make KaTeX fail or silently swallow text -- unbalanced math delimiters
($ / $$ / \( \) / \[ \]), unbalanced braces inside math, \frac-style commands without two arguments, \begin/\end
mismatches and unknown environments, and \left/\right imbalance. Use \$ for a literal dollar sign.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

FRAC_LIKE = frozenset({"frac", "dfrac", "tfrac", "cfrac", "binom", "dbinom", "tbinom"})
KNOWN_ENVS = frozenset(
    {
        "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix", "smallmatrix", "cases", "array",
        "aligned", "alignedat", "align", "align*", "gathered", "gather", "gather*", "split", "equation",
        "equation*", "eqnarray", "subarray", "multline", "multline*",
    }
)
_CMD = re.compile(r"[a-zA-Z]+\*?")
_ENV_ARG = re.compile(r"\s*\{([^{}]*)\}")


@dataclass(frozen=True)
class LatexIssue:
    code: str
    message: str


def _take_arg(s: str, pos: int) -> int | None:
    """Return the index after one TeX argument starting at/after pos, or None when there is none."""
    n = len(s)
    while pos < n and s[pos].isspace():
        pos += 1
    if pos >= n:
        return None
    c = s[pos]
    if c == "{":
        depth = 0
        j = pos
        while j < n:
            if s[j] == "\\":
                j += 2
                continue
            if s[j] == "{":
                depth += 1
            elif s[j] == "}":
                depth -= 1
                if depth == 0:
                    return j + 1
            j += 1
        return None
    if c == "\\":
        m = _CMD.match(s, pos + 1)
        return m.end() if m else min(pos + 2, n)
    if c.isalnum():
        return pos + 1
    return None


def _check_math(seg: str, where: str) -> list[LatexIssue]:
    issues: list[LatexIssue] = []
    depth = 0
    env_stack: list[str] = []
    lefts = rights = 0
    i, n = 0, len(seg)
    while i < n:
        c = seg[i]
        if c == "\\":
            m = _CMD.match(seg, i + 1)
            if not m:
                i += 2  # escaped symbol: \{ \} \\ \, ...
                continue
            name = m.group()
            after = m.end()
            if name in FRAC_LIKE:
                p1 = _take_arg(seg, after)
                p2 = _take_arg(seg, p1) if p1 is not None else None
                if p2 is None:
                    issues.append(LatexIssue("FRAC_ARGS", f"\\{name} needs two arguments in {where}"))
            elif name in ("begin", "end"):
                em = _ENV_ARG.match(seg, after)
                if not em:
                    issues.append(LatexIssue("ENV_NAME", f"\\{name} without {{name}} in {where}"))
                else:
                    env = em.group(1).strip()
                    if env not in KNOWN_ENVS:
                        issues.append(LatexIssue("UNKNOWN_ENV", f"unknown environment '{env}' in {where}"))
                    if name == "begin":
                        env_stack.append(env)
                    elif not env_stack:
                        issues.append(LatexIssue("ENV_MISMATCH", f"\\end{{{env}}} without \\begin in {where}"))
                    else:
                        top = env_stack.pop()
                        if top != env:
                            issues.append(
                                LatexIssue("ENV_MISMATCH", f"\\begin{{{top}}} closed by \\end{{{env}}} in {where}")
                            )
                    after = em.end()
            elif name == "left":
                lefts += 1
            elif name == "right":
                rights += 1
            i = after
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth < 0:
                issues.append(LatexIssue("BRACES", f"unmatched '}}' in {where}"))
                depth = 0
        i += 1
    if depth > 0:
        issues.append(LatexIssue("BRACES", f"{depth} unclosed '{{' in {where}"))
    for env in env_stack:
        issues.append(LatexIssue("ENV_MISMATCH", f"\\begin{{{env}}} is never closed in {where}"))
    if lefts != rights:
        issues.append(LatexIssue("LEFT_RIGHT", f"\\left/\\right count mismatch ({lefts} vs {rights}) in {where}"))
    return issues


_OPENERS = {"inline": "$", "display": "$$", "paren": "\\(", "bracket": "\\["}
_CLOSERS = {"inline": "$", "display": "$$", "paren": "\\)", "bracket": "\\]"}


def check_latex(text: str) -> list[LatexIssue]:
    """Structural check of text with inline/display math. Empty list means structurally fine."""
    issues: list[LatexIssue] = []
    mode: str | None = None
    start = 0
    n = len(text)
    i = 0
    seg_no = 0
    while i < n:
        c = text[i]
        if c == "\\":
            nxt = text[i + 1] if i + 1 < n else ""
            if mode is None:
                if nxt == "(":
                    mode, start, i = "paren", i + 2, i + 2
                    continue
                if nxt == "[":
                    mode, start, i = "bracket", i + 2, i + 2
                    continue
                if nxt in (")", "]"):
                    issues.append(LatexIssue("DELIMITER", f"unmatched \\{nxt} with no opening delimiter"))
                    i += 2
                    continue
                m = _CMD.match(text, i + 1)
                if m and m.group() == "begin":
                    issues.append(LatexIssue("ENV_OUTSIDE_MATH", "\\begin used outside math delimiters"))
                i += 2
                continue
            # inside math
            if (mode == "paren" and nxt == ")") or (mode == "bracket" and nxt == "]"):
                seg_no += 1
                issues += _check_math(text[start:i], f"math segment {seg_no}")
                mode = None
                i += 2
                continue
            if nxt in ("(", "["):
                issues.append(LatexIssue("NESTED_MATH", f"\\{nxt} opened inside math (missing closing delimiter?)"))
            elif nxt in (")", "]"):
                issues.append(LatexIssue("DELIMITER", f"\\{nxt} does not match the open {mode} math"))
            i += 2
            continue
        if c == "$":
            if mode is None:
                if text.startswith("$$", i):
                    mode, start, i = "display", i + 2, i + 2
                else:
                    mode, start, i = "inline", i + 1, i + 1
                continue
            if mode == "inline":
                seg_no += 1
                issues += _check_math(text[start:i], f"math segment {seg_no}")
                mode = None
                i += 1
                continue
            if mode == "display":
                if text.startswith("$$", i):
                    seg_no += 1
                    issues += _check_math(text[start:i], f"math segment {seg_no}")
                    mode = None
                    i += 2
                else:
                    issues.append(LatexIssue("DELIMITER", "single $ inside $$...$$"))
                    i += 1
                continue
            issues.append(LatexIssue("NESTED_MATH", f"$ inside {_OPENERS[mode]} math"))
            i += 1
            continue
        i += 1
    if mode is not None:
        issues.append(
            LatexIssue("UNCLOSED_MATH", f"math opened with {_OPENERS[mode]} is never closed with {_CLOSERS[mode]}")
        )
    return issues


_DISPLAY = re.compile(r"(?<!\\)\$\$(.+?)(?<!\\)\$\$|(?<!\\)\\\[(.+?)(?<!\\)\\\]", re.DOTALL)


def split_blocks(text: str) -> list[dict[str, Any]]:
    r"""Text -> ContentBlock[] (paragraph / math, per packages/contracts domain/content.ts).

    Display math ($$..$$, \[..\]) becomes {"type":"math","latex"}; everything else stays in paragraphs
    (inline math is kept in the text); blank lines separate paragraphs.
    """
    blocks: list[dict[str, Any]] = []

    def paras(chunk: str) -> None:
        for p in re.split(r"\n\s*\n", chunk):
            p = p.strip()
            if p:
                blocks.append({"type": "paragraph", "text": p})

    pos = 0
    for m in _DISPLAY.finditer(text):
        paras(text[pos : m.start()])
        latex = (m.group(1) if m.group(1) is not None else m.group(2)).strip()
        if latex:
            blocks.append({"type": "math", "latex": latex})
        pos = m.end()
    paras(text[pos:])
    if not blocks:
        blocks.append({"type": "paragraph", "text": text.strip()})
    return blocks


def blocks_to_text(blocks: list[dict[str, Any]]) -> str:
    """Python twin of app_private.blocks_to_text (paragraph text, math wrapped in $..$), space separated."""
    parts: list[str] = []
    for b in blocks:
        t = b.get("type")
        if t == "paragraph":
            parts.append(b["text"])
        elif t == "math":
            parts.append("$" + b["latex"] + "$")
        elif t == "list":
            parts.append(" ".join(b["items"]))
    return " ".join(parts)
