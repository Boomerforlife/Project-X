"""Safe SymPy checker. Protocol (AI_PIPELINE section 5): stdin = JSON array of requests, stdout = JSON array of results.

Run as ``python -m pxw.verification.sympy_check``. Any crash yields ERROR for every request; exit code is always 0.
Expressions are never evaluated before passing the character and identifier allow-lists.
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import re
import sys
import time
from typing import Any

import sympy
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication,
    parse_expr,
    standard_transformations,
)

EXPR_RE = re.compile(r"^[A-Za-z0-9_+\-*/^().,\s]{1,500}$")
IDENT_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
NUMBER_RE = re.compile(r"\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?")
VALID_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,31}$")
ALLOWED_FUNCS: dict[str, Any] = {
    "pi": sympy.pi,
    "E": sympy.E,
    "sqrt": sympy.sqrt,
    "sin": sympy.sin,
    "cos": sympy.cos,
    "tan": sympy.tan,
    "asin": sympy.asin,
    "acos": sympy.acos,
    "atan": sympy.atan,
    "log": sympy.log,
    "ln": sympy.log,
    "exp": sympy.exp,
    "Abs": sympy.Abs,
    "Rational": sympy.Rational,
    "Integer": sympy.Integer,
}
PARSE_GLOBALS: dict[str, Any] = {
    "__builtins__": {},
    "Integer": sympy.Integer,
    "Float": sympy.Float,
    "Rational": sympy.Rational,
    "Symbol": sympy.Symbol,
}
TRANSFORMS = standard_transformations + (implicit_multiplication, convert_xor)
DEFAULT_TIMEOUT_MS = 5000
KINDS = ("NUMERIC_EVAL", "SYMBOLIC_EQUIV")


class CheckError(Exception):
    """Raised for rejected / malformed requests (status ERROR)."""


def _result(rid: str, status: str, computed: str | None = None, message: str | None = None) -> dict[str, Any]:
    return {"id": rid, "status": status, "computed": computed, "message": message}


def validate_expression(expr: Any, allowed: set[str]) -> str:
    if not isinstance(expr, str) or not EXPR_RE.match(expr):
        raise CheckError("expression contains disallowed characters or has invalid length")
    stripped = NUMBER_RE.sub(" ", expr)
    for ident in IDENT_RE.findall(stripped):
        if ident not in allowed:
            raise CheckError(f"disallowed identifier: {ident}")
    return expr


def parse_safe(expr: str, symbols: dict[str, Any]) -> sympy.Expr:
    allowed = set(ALLOWED_FUNCS) | set(symbols)
    validate_expression(expr, allowed)
    local = {**ALLOWED_FUNCS, **symbols}
    try:
        result = parse_expr(expr, local_dict=local, global_dict=PARSE_GLOBALS, transformations=TRANSFORMS)
    except Exception as exc:
        raise CheckError(f"parse error: {type(exc).__name__}") from exc
    if not isinstance(result, sympy.Basic):
        raise CheckError("expression did not produce a symbolic value")
    return result


def _variables(req: dict[str, Any]) -> dict[str, str]:
    raw = req.get("variables") or {}
    if not isinstance(raw, dict):
        raise CheckError("variables must be an object")
    out: dict[str, str] = {}
    for name, value in raw.items():
        if not isinstance(name, str) or not VALID_NAME_RE.match(name) or name in ALLOWED_FUNCS:
            raise CheckError(f"invalid variable name: {name!r}")
        if not isinstance(value, str):
            raise CheckError(f"variable {name} value must be a string")
        out[name] = value
    return out


def _to_float(value: sympy.Expr) -> float | None:
    try:
        num = sympy.N(value, 30)
    except Exception:  # noqa: BLE001
        return None
    if not num.is_number or not num.is_real or num.is_infinite:
        return None
    return float(num)


def _close(a: float, b: float, rel_tol: float) -> bool:
    scale = max(abs(a), abs(b))
    if scale < 1e-12:
        return True
    return abs(a - b) <= rel_tol * scale


def _numeric_eval(req: dict[str, Any], variables: dict[str, str], rel_tol: float) -> dict[str, Any]:
    rid = str(req["id"])
    values = {name: parse_safe(val, {}) for name, val in variables.items()}
    syms = {name: sympy.Symbol(name) for name in variables}
    sub = {syms[n]: v for n, v in values.items()}
    expr = parse_safe(req["expression"], syms).subs(sub)
    target = parse_safe(req["compare_to"], syms).subs(sub)
    a, b = _to_float(expr), _to_float(target)
    if a is None or b is None:
        return _result(rid, "INCONCLUSIVE", None, "expression did not evaluate to a finite real number")
    if _close(a, b, rel_tol):
        return _result(rid, "PASS", repr(a), None)
    return _result(rid, "FAIL", repr(a), f"computed {a!r} differs from expected {b!r}")


def _symbolic_equiv(req: dict[str, Any], variables: dict[str, str], rel_tol: float) -> dict[str, Any]:
    rid = str(req["id"])
    syms = {name: sympy.Symbol(name) for name in variables}
    left = parse_safe(req["expression"], syms)
    right = parse_safe(req["compare_to"], syms)
    diff = sympy.simplify(left - right)
    if diff == 0:
        return _result(rid, "PASS", "0", None)
    if not diff.free_symbols:
        val = _to_float(diff)
        if val is not None and abs(val) < 1e-12:
            return _result(rid, "PASS", "0", None)
        return _result(rid, "FAIL", str(diff), "difference is a non-zero constant")
    # Symbolic residue: probe numerically at the declared values (if any) plus fixed sample points.
    points: list[dict[Any, Any]] = []
    if variables:
        points.append({syms[n]: parse_safe(v, {}) for n, v in variables.items()})
    for k, sample in enumerate((sympy.Rational(3, 7), sympy.Rational(11, 5), sympy.Rational(17, 13))):
        points.append({s: sample + k for s in syms.values()})
    for point in points:
        a, b = _to_float(left.subs(point)), _to_float(right.subs(point))
        if a is not None and b is not None and not _close(a, b, rel_tol):
            return _result(rid, "FAIL", str(diff), "expressions differ numerically")
    return _result(rid, "INCONCLUSIVE", str(diff), "could not prove equivalence symbolically")


def check_one(req: Any) -> dict[str, Any]:
    rid = str(req.get("id", "")) if isinstance(req, dict) else ""
    try:
        if not isinstance(req, dict) or "id" not in req:
            raise CheckError("request must be an object with an id")
        if req.get("kind") not in KINDS:
            raise CheckError("unknown kind")
        variables = _variables(req)
        rel_tol = req.get("rel_tolerance", 1e-6)
        if not isinstance(rel_tol, (int, float)) or isinstance(rel_tol, bool) or not 0 <= rel_tol <= 1:
            raise CheckError("invalid rel_tolerance")
        if req["kind"] == "NUMERIC_EVAL":
            return _numeric_eval(req, variables, float(rel_tol))
        return _symbolic_equiv(req, variables, float(rel_tol))
    except CheckError as exc:
        return _result(rid, "ERROR", None, str(exc))
    except Exception as exc:  # noqa: BLE001 - never crash the batch
        return _result(rid, "ERROR", None, f"{type(exc).__name__}: {exc}"[:300])


def _child(conn: Any, reqs: list[Any]) -> None:
    for req in reqs:
        conn.send(check_one(req))
    conn.close()


def run_batch(reqs: list[Any], timeout_ms: int = DEFAULT_TIMEOUT_MS) -> list[dict[str, Any]]:
    """Evaluate in a child process so a pathological expression can be killed at the wall deadline."""
    ctx = mp.get_context("spawn")
    parent, child = ctx.Pipe(duplex=False)
    proc = ctx.Process(target=_child, args=(child, reqs), daemon=True)
    proc.start()
    child.close()
    deadline = time.monotonic() + timeout_ms / 1000.0
    results: list[dict[str, Any]] = []
    try:
        while len(results) < len(reqs):
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not parent.poll(remaining):
                break
            try:
                results.append(parent.recv())
            except EOFError:
                break
    finally:
        if proc.is_alive():
            proc.kill()
        proc.join(timeout=2)
    for req in reqs[len(results):]:
        rid = str(req.get("id", "")) if isinstance(req, dict) else ""
        results.append(_result(rid, "INCONCLUSIVE", None, "timeout"))
    return results


def main() -> int:
    try:
        reqs = json.loads(sys.stdin.read())
        if not isinstance(reqs, list):
            raise TypeError("input must be a JSON array")
    except Exception:  # noqa: BLE001
        sys.stdout.write("[]")
        return 0
    try:
        timeout_ms = int(os.environ.get("SYMPY_TIMEOUT_MS", DEFAULT_TIMEOUT_MS))
        out = run_batch(reqs, timeout_ms)
    except Exception as exc:  # noqa: BLE001
        out = [
            _result(str(r.get("id", "")) if isinstance(r, dict) else "", "ERROR", None, f"crash: {type(exc).__name__}")
            for r in reqs
        ]
    sys.stdout.write(json.dumps(out))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
