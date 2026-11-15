"""`pxw content ...` CLI commands. Exit codes follow pxw.cli: 0 ok, 1 problems found/other, 2 usage/config, 3 source not approved."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from pxw.common.logging import emit
from pxw.config import ConfigError, Settings
from pxw.content.schema import FileFormatError, load_records

EXIT_OK, EXIT_PROBLEMS, EXIT_USAGE = 0, 1, 2


def _load(path: str) -> list[Any]:
    try:
        return load_records(path)
    except FileFormatError as exc:
        raise ConfigError(str(exc)) from exc


def _db_conn(settings: Settings) -> Any:
    if not settings.database_url:
        raise ConfigError("this command needs DATABASE_URL")
    from pxw.db.pg import get_connection

    return get_connection(settings.database_url)


def _emit_rows(results: list[dict[str, Any]], *, only_problems: bool = True) -> None:
    for r in results:
        if only_problems and not (r["errors"] or r["warnings"] or r["duplicate_of"]):
            continue
        emit({"event": "row", **r})


def cmd_validate(args: argparse.Namespace, settings: Settings) -> int:
    from pxw.content.taxonomy import load_db_taxonomy, parse_seed_taxonomy
    from pxw.content.validate import PgLookup, validate_records

    records = _load(args.file)
    if args.db:
        conn = _db_conn(settings)
        try:
            report = validate_records(
                records, taxonomy=load_db_taxonomy(conn), db=PgLookup(conn), allow_examples=args.allow_examples
            )
        finally:
            conn.rollback()
    else:
        report = validate_records(records, taxonomy=parse_seed_taxonomy(), allow_examples=args.allow_examples)
    _emit_rows([r.to_dict() for r in report.results])
    emit({"event": "summary", "file": args.file, **report.summary})
    return EXIT_OK if report.ok else EXIT_PROBLEMS


def cmd_import(args: argparse.Namespace, settings: Settings) -> int:
    from pxw.content.importer import import_rows

    records = _load(args.file)
    conn = _db_conn(settings)
    rep = import_rows(
        conn,
        records,
        dry_run=args.dry_run,
        skip_invalid=args.skip_invalid,
        allow_examples=args.allow_examples,
        file_name=Path(args.file).name,
    )
    _emit_rows(rep.invalid + rep.duplicates, only_problems=False)
    for r in rep.validation.results if rep.validation else []:
        if r.status == "valid" and r.warnings:
            emit({"event": "row", **r.to_dict()})
    emit({"event": "summary", "file": args.file, **rep.to_dict()})
    return EXIT_PROBLEMS if (rep.refused or rep.invalid) else EXIT_OK


def cmd_coverage(args: argparse.Namespace, settings: Settings) -> int:
    from pxw.content import coverage as cov

    if args.file:
        from pxw.content.taxonomy import parse_seed_taxonomy

        rep = cov.coverage_from_records(_load(args.file), parse_seed_taxonomy(), allow_examples=args.allow_examples)
    else:
        rep = cov.coverage_from_db(_db_conn(settings))
    text = cov.render_json(rep) if args.json else cov.render_markdown(rep)
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        emit({"event": "done", "output": str(out), "format": "json" if args.json else "markdown",
              "source": rep["source"], "totals": rep["totals"]})
    else:
        import sys

        sys.stdout.write(text)
    return EXIT_OK


def add_content_parser(sub: Any) -> None:
    c = sub.add_parser("content", help="licence-aware question import (DRAFTs only), validation, coverage")
    cs = c.add_subparsers(dest="content_cmd", required=True)

    v = cs.add_parser("validate", help="validate a CSV/JSON/JSONL question file (offline unless --db)")
    v.add_argument("file")
    v.add_argument("--db", action="store_true", help="also check sources, papers, taxonomy and duplicates against DATABASE_URL")
    v.add_argument("--allow-examples", action="store_true", help="accept rows whose stem starts with [EXAMPLE]")
    v.set_defaults(fn=cmd_validate)

    i = cs.add_parser("import", help="import valid rows as DRAFT questions (needs DATABASE_URL; never publishes)")
    i.add_argument("file")
    i.add_argument("--dry-run", action="store_true", help="run everything, then roll the transaction back")
    i.add_argument("--skip-invalid", action="store_true", help="import valid rows even if other rows are invalid")
    i.add_argument("--allow-examples", action="store_true", help="accept rows whose stem starts with [EXAMPLE] (tests only)")
    i.set_defaults(fn=cmd_import)

    g = cs.add_parser("coverage", help="coverage report from the DB, or of an import file with --file (offline)")
    g.add_argument("--file", default=None, help="report what this import file would add instead of querying the DB")
    g.add_argument("--json", action="store_true")
    g.add_argument("--out", default=None)
    g.add_argument("--allow-examples", action="store_true")
    g.set_defaults(fn=cmd_coverage)
