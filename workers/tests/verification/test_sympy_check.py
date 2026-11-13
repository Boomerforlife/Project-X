from __future__ import annotations

import json
import subprocess
import sys

import pytest

from pxw.verification import sympy_check as sc


def req(kind: str, expression: str, compare_to: str, variables: dict[str, str] | None = None) -> dict:
    return {
        "id": "r1",
        "kind": kind,
        "expression": expression,
        "compare_to": compare_to,
        "variables": variables or {},
        "rel_tolerance": 1e-6,
    }


def test_numeric_pass() -> None:
    r = sc.check_one(req("NUMERIC_EVAL", "m*g*h", "98", {"m": "2", "g": "9.8", "h": "5"}))
    assert r["status"] == "PASS"
    assert r["id"] == "r1"


def test_numeric_fail() -> None:
    r = sc.check_one(req("NUMERIC_EVAL", "m*g*h", "100", {"m": "2", "g": "9.8", "h": "5"}))
    assert r["status"] == "FAIL"
    assert r["computed"] is not None


def test_numeric_caret_and_functions() -> None:
    assert sc.check_one(req("NUMERIC_EVAL", "sqrt(2)^2 + ln(E)", "3"))["status"] == "PASS"
    assert sc.check_one(req("NUMERIC_EVAL", "2x", "6", {"x": "3"}))["status"] == "PASS"


def test_symbolic_pass() -> None:
    r = sc.check_one(req("SYMBOLIC_EQUIV", "(x+1)^2", "x^2 + 2*x + 1", {"x": "1"}))
    assert r["status"] == "PASS"


def test_symbolic_fail_constant_and_numeric() -> None:
    assert sc.check_one(req("SYMBOLIC_EQUIV", "x + 1", "x + 2", {"x": "1"}))["status"] == "FAIL"
    assert sc.check_one(req("SYMBOLIC_EQUIV", "x^2", "2*x", {"x": "3"}))["status"] == "FAIL"


def test_inconclusive_non_real() -> None:
    assert sc.check_one(req("NUMERIC_EVAL", "sqrt(-1)", "1"))["status"] == "INCONCLUSIVE"


@pytest.mark.parametrize(
    "expr",
    [
        "__import__('os').system('echo hi')",
        "x.__class__",
        "open(x)",
        "eval(x)",
        "lambda: 1",
        "x; y",
        "a" * 600,
        "foo(2)",
        "Symbol(x)",
    ],
)
def test_disallowed_rejected(expr: str) -> None:
    r = sc.check_one(req("NUMERIC_EVAL", expr, "1", {"x": "1"}))
    assert r["status"] == "ERROR"


def test_bad_kind_and_variables() -> None:
    assert sc.check_one({"id": "z", "kind": "EXEC", "expression": "1", "compare_to": "1"})["status"] == "ERROR"
    assert sc.check_one(req("NUMERIC_EVAL", "1", "1", {"__x": "1"}))["status"] == "ERROR"
    assert sc.check_one(req("NUMERIC_EVAL", "x", "1", {"x": "__import__"}))["status"] == "ERROR"


def test_timeout_marks_remaining_inconclusive() -> None:
    hard = req("NUMERIC_EVAL", "9^9^9^9^9", "1")
    out = sc.run_batch([hard], timeout_ms=1500)
    assert out[0]["status"] == "INCONCLUSIVE"
    assert out[0]["message"] == "timeout"


def test_cli_roundtrip_order_and_crash_safety() -> None:
    reqs = [
        {**req("NUMERIC_EVAL", "1+1", "2"), "id": "a"},
        {**req("NUMERIC_EVAL", "1+1", "3"), "id": "b"},
        {"id": "c", "kind": "NUMERIC_EVAL", "expression": "os.system(1)", "compare_to": "1"},
    ]
    proc = subprocess.run(
        [sys.executable, "-m", "pxw.verification.sympy_check"],
        input=json.dumps(reqs),
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert proc.returncode == 0
    out = json.loads(proc.stdout)
    assert [r["id"] for r in out] == ["a", "b", "c"]
    assert [r["status"] for r in out] == ["PASS", "FAIL", "ERROR"]


def test_cli_garbage_input_exit_zero() -> None:
    proc = subprocess.run(
        [sys.executable, "-m", "pxw.verification.sympy_check"],
        input="not json",
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert proc.returncode == 0
    assert json.loads(proc.stdout) == []
