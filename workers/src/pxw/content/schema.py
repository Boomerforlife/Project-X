"""Import row model, file loading (CSV / JSON / JSONL) and answer parsing.

Contract references: packages/contracts/src/domain/answers.ts (AnswerKey) and domain/content.ts (ContentBlock);
enums from supabase/migrations/0002_enums.sql (question_type, difficulty).
"""

from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

QUESTION_TYPES = ("SINGLE_MCQ", "MULTI_MCQ", "NUMERICAL")
DIFFICULTIES = ("EASY", "MEDIUM", "HARD")
OPTION_LABELS = ("A", "B", "C", "D")
OPTION_COLUMNS = tuple(f"option_{x.lower()}" for x in OPTION_LABELS)
KNOWN_FIELDS = frozenset(
    {
        "source", "licence", "source_ref", "exam", "subject", "chapter", "type", "stem", "answer", "options",
        "topic", "difficulty", "year", "paper", "question_number", "external_id", "solution", "notes",
        *OPTION_COLUMNS,
    }
)
REQUIRED_FIELDS = ("source", "licence", "source_ref", "exam", "subject", "chapter", "type", "stem", "answer")
SUPPORTED_SUFFIXES = {".csv": "csv", ".json": "json", ".jsonl": "jsonl", ".ndjson": "jsonl"}


@dataclass(frozen=True)
class Issue:
    code: str
    message: str
    field: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "message": self.message, "field": self.field}


@dataclass
class RawRecord:
    """One input row before validation. `index` is the 1-based data row (CSV header excluded; JSONL non-blank line)."""

    index: int
    data: dict[str, Any] | None
    error: str | None = None


class ContentRow(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    source: str = Field(min_length=1, max_length=40)
    licence: str = Field(min_length=1, max_length=500)
    source_ref: str = Field(min_length=1, max_length=1000)
    exam: str = Field(min_length=1, max_length=60)
    subject: str = Field(min_length=1, max_length=60)
    chapter: str = Field(min_length=1, max_length=120)
    qtype: Literal["SINGLE_MCQ", "MULTI_MCQ", "NUMERICAL"] = Field(alias="type")
    stem: str = Field(min_length=1)
    answer: str = Field(min_length=1, max_length=200)
    options: list[str] | None = None
    topic: str | None = None
    difficulty: Literal["EASY", "MEDIUM", "HARD"] | None = None
    year: int | None = Field(default=None, ge=1978, le=2100)
    paper: str | None = None
    question_number: str | None = Field(default=None, max_length=40)
    external_id: str | None = Field(default=None, max_length=200)
    solution: str | None = None
    notes: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _clean(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        out: dict[str, Any] = {}
        for k, v in data.items():
            if k is None:
                continue
            key = str(k).strip().lower()
            if isinstance(v, bool):
                out[key] = v
                continue
            if isinstance(v, (int, float)):
                v = str(v) if key not in ("year",) else v
            if isinstance(v, str):
                v = v.strip()
                if v == "":
                    v = None
            out[key] = v
        if "licence" not in out and "license" in out:
            out["licence"] = out.pop("license")
        # CSV option_a..option_d columns -> options (positions kept so blanks are reported, not shifted)
        if out.get("options") is None and any(c in out for c in OPTION_COLUMNS):
            opts = [(out.get(c) or "") for c in OPTION_COLUMNS]
            out["options"] = opts if any(opts) else None
        elif isinstance(out.get("options"), list):
            out["options"] = [str(x).strip() if isinstance(x, (str, int, float)) and not isinstance(x, bool) else x
                              for x in out["options"]]
        for key in ("type", "difficulty"):
            if isinstance(out.get(key), str):
                out[key] = out[key].upper().replace("-", "_").replace(" ", "_")
        if isinstance(out.get("year"), str):
            y = out["year"]
            out["year"] = int(y) if re.fullmatch(r"\d{4}", y) else y
        return out



def unknown_fields(data: dict[str, Any]) -> list[str]:
    return sorted(str(k).strip().lower() for k in data if k is not None and str(k).strip().lower() not in KNOWN_FIELDS)


def parse_row(data: dict[str, Any]) -> tuple[ContentRow | None, list[Issue]]:
    """Pydantic validation -> (row, issues). Missing/blank required fields become MISSING_<FIELD> (never defaulted)."""
    try:
        return ContentRow.model_validate(data), []
    except ValidationError as exc:
        issues: list[Issue] = []
        for err in exc.errors():
            loc = [str(p) for p in err["loc"]]
            name = loc[0] if loc else "row"
            if err["type"] in ("missing", "string_too_short") or (name in REQUIRED_FIELDS and err.get("input") is None):
                issues.append(Issue(f"MISSING_{name.upper()}", f"required field '{name}' is missing or empty", name))
            else:
                issues.append(Issue(f"INVALID_{name.upper()}", f"{name}: {err['msg']}", name))
        return None, issues


# --- file loading ---------------------------------------------------------------------------------


class FileFormatError(Exception):
    """Whole-file problem (unknown suffix, not an array, unreadable)."""


def detect_format(path: Path) -> str:
    fmt = SUPPORTED_SUFFIXES.get(path.suffix.lower())
    if fmt is None:
        raise FileFormatError(f"unsupported file type {path.suffix!r} (use .csv, .json or .jsonl)")
    return fmt


def load_records(path: str | Path) -> list[RawRecord]:
    p = Path(path)
    fmt = detect_format(p)
    try:
        text = p.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError) as exc:
        raise FileFormatError(f"cannot read {p}: {exc}") from exc
    return parse_text(text, fmt)


def parse_text(text: str, fmt: str) -> list[RawRecord]:
    if fmt == "csv":
        reader = csv.DictReader(io.StringIO(text, newline=""))
        if not reader.fieldnames:
            raise FileFormatError("CSV has no header row")
        reader.fieldnames = [(h or "").strip().lower() for h in reader.fieldnames]
        out: list[RawRecord] = []
        for i, row in enumerate(reader, start=1):
            if None in row:
                out.append(RawRecord(i, None, "row has more cells than the header has columns"))
                continue
            out.append(RawRecord(i, {k: v for k, v in row.items() if k}))
        return out
    if fmt == "json":
        try:
            arr = json.loads(text)
        except json.JSONDecodeError as exc:
            raise FileFormatError(f"invalid JSON: {exc}") from exc
        if not isinstance(arr, list):
            raise FileFormatError("JSON file must be an array of objects")
        return [
            RawRecord(i, o) if isinstance(o, dict) else RawRecord(i, None, "element is not a JSON object")
            for i, o in enumerate(arr, start=1)
        ]
    if fmt == "jsonl":
        out = []
        n = 0
        for line in text.splitlines():
            if not line.strip():
                continue
            n += 1
            try:
                o = json.loads(line)
            except json.JSONDecodeError as exc:
                out.append(RawRecord(n, None, f"invalid JSON line: {exc.msg}"))
                continue
            out.append(RawRecord(n, o) if isinstance(o, dict) else RawRecord(n, None, "line is not a JSON object"))
        return out
    raise FileFormatError(f"unknown format {fmt!r}")


# --- answers --------------------------------------------------------------------------------------

_DEC = r"-?\d+(?:\.\d+)?"
_NUM = re.compile(rf"^{_DEC}$")
_RANGE = re.compile(rf"^({_DEC})\s*\.\.\s*({_DEC})$")


def parse_mcq_answer(answer: str, n_options: int, multi: bool) -> tuple[list[str], list[Issue]]:
    """'A' or 'A,C' -> (['A','C'], issues). Labels must be among the first n_options of A..D."""
    allowed = OPTION_LABELS[:n_options]
    parts = [p for p in re.split(r"[,\s;/]+", answer.strip().upper()) if p]
    issues: list[Issue] = []
    if not parts:
        return [], [Issue("ANSWER_INVALID", "answer is empty", "answer")]
    bad = [p for p in parts if p not in allowed]
    if bad:
        issues.append(Issue("ANSWER_NOT_AN_OPTION", f"answer label(s) {bad} are not among the options {list(allowed)}", "answer"))
    if len(set(parts)) != len(parts):
        issues.append(Issue("ANSWER_INVALID", "answer repeats a label", "answer"))
    if not multi and len(parts) > 1:
        issues.append(Issue("ANSWER_MULTI_FOR_SINGLE", "SINGLE_MCQ needs exactly one correct label", "answer"))
    return (list(dict.fromkeys(parts)) if not issues else parts), issues


def _plain(d: Decimal) -> str:
    s = format(d.normalize(), "f")
    return "0" if s in ("-0", "") else s


def parse_numeric_answer(answer: str) -> tuple[dict[str, Any] | None, list[Issue]]:
    """'4', '-2.5', '3.9..4.1' (';' separates up to 5 ranges) -> AnswerKey NUMERICAL dict without option ids.

    The contract (DecSchema) only allows plain decimals up to 20 chars: no exponents, no '+', no thousands separators.
    """
    ranges: list[dict[str, str]] = []
    for part in [p.strip() for p in answer.split(";") if p.strip()]:
        m = _RANGE.match(part)
        if m:
            lo, hi = m.group(1), m.group(2)
        elif _NUM.match(part):
            lo = hi = part
        else:
            return None, [Issue("ANSWER_NOT_NUMERIC", f"'{part}' is not a plain decimal number or 'min..max' range", "answer")]
        if len(lo) > 20 or len(hi) > 20:
            return None, [Issue("ANSWER_NOT_NUMERIC", "numbers are limited to 20 characters", "answer")]
        try:
            if Decimal(lo) > Decimal(hi):
                return None, [Issue("ANSWER_RANGE_ORDER", f"range '{part}' has min greater than max", "answer")]
        except InvalidOperation:
            return None, [Issue("ANSWER_NOT_NUMERIC", f"'{part}' is not a number", "answer")]
        ranges.append({"min": lo, "max": hi})
    if not ranges:
        return None, [Issue("ANSWER_INVALID", "answer is empty", "answer")]
    if len(ranges) > 5:
        return None, [Issue("ANSWER_NOT_NUMERIC", "at most 5 accepted ranges are allowed", "answer")]
    first = ranges[0]
    if first["min"] == first["max"]:
        display = first["min"]
    else:
        display = _plain((Decimal(first["min"]) + Decimal(first["max"])) / 2)
    return {"type": "NUMERICAL", "accepted_ranges": ranges, "display_value": display}, []
