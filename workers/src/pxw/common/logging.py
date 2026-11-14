"""Logging (stderr) and JSON-lines output (stdout)."""

from __future__ import annotations

import json
import logging
import sys
from typing import Any

_LOGGER_NAME = "pxw"


def configure_logging(level: str = "info") -> logging.Logger:
    logger = logging.getLogger(_LOGGER_NAME)
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        logger.addHandler(handler)
    return logger


def get_logger(name: str = "") -> logging.Logger:
    return logging.getLogger(f"{_LOGGER_NAME}.{name}" if name else _LOGGER_NAME)


def emit(event: dict[str, Any]) -> None:
    """Write one JSON line to stdout (the CLI's machine-readable output channel)."""
    sys.stdout.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")
    sys.stdout.flush()
