"""Shared psycopg connection (one per URL per process: PGlite's socket server allows a single connection)."""

from __future__ import annotations

import contextlib
from typing import Any

_CONNS: dict[str, Any] = {}


def get_connection(url: str) -> Any:
    import psycopg
    from psycopg.rows import dict_row

    conn = _CONNS.get(url)
    if conn is None or conn.closed:
        conn = psycopg.connect(url, autocommit=False, row_factory=dict_row, prepare_threshold=None)
        _CONNS[url] = conn
    return conn


def close_all() -> None:
    for c in list(_CONNS.values()):
        with contextlib.suppress(Exception):
            c.close()
    _CONNS.clear()


def run(url: str, fn: Any) -> Any:
    """Run fn(cursor) in one transaction on the shared connection (commit on success, rollback on error)."""
    conn = get_connection(url)
    try:
        with conn.cursor() as cur:
            result = fn(cur)
        conn.commit()
        return result
    except BaseException:
        conn.rollback()
        raise
