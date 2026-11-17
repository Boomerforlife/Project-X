"""Stage artifacts: `{work_dir}/{doc_sha256}/{stage}.v{N}.json`, written atomically, with their own sha256.

A stage is skipped when its artifact exists, parses, its payload hash matches and its `input_key`
(hash of stage version + upstream payload hashes + parameters) equals the current one.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pxw.common.errors import StopAfterStage
from pxw.common.hashing import sha256_hex
from pxw.common.jsonio import atomic_write_json, canonical_json, read_json

STAGE_VERSIONS: dict[str, int] = {
    "fetch": 1,
    "extract": 1,
    "ocr": 1,
    "segment": 1,
    "nta_image": 2,
    "jee_adv": 1,
    "nta_mirror": 1,
    "figures": 1,
    "normalize": 1,
}
CACHED_STAGES = tuple(STAGE_VERSIONS)  # dedupe/persist/promote depend on DB state and always run (idempotent)


@dataclass
class StageReport:
    stage: str
    skipped: bool
    duration_ms: int
    counts: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"stage": self.stage, "skipped": self.skipped, "duration_ms": self.duration_ms, "counts": self.counts}


def artifact_path(doc_dir: Path, stage: str) -> Path:
    return doc_dir / f"{stage}.v{STAGE_VERSIONS[stage]}.json"


def payload_hash(payload: Any) -> str:
    return sha256_hex(canonical_json(payload))


def input_key(stage: str, *parts: Any) -> str:
    return sha256_hex(canonical_json([stage, STAGE_VERSIONS[stage], *parts]))


def load_artifact(doc_dir: Path, stage: str, key: str) -> dict[str, Any] | None:
    p = artifact_path(doc_dir, stage)
    if not p.is_file():
        return None
    try:
        art = read_json(p)
        payload = art["payload"]
        if art["input_key"] != key or art["payload_sha256"] != payload_hash(payload):
            return None
        return art
    except (ValueError, KeyError, OSError):
        return None


def write_artifact(doc_dir: Path, stage: str, key: str, payload: Any) -> dict[str, Any]:
    art = {
        "stage": stage,
        "stage_version": STAGE_VERSIONS[stage],
        "input_key": key,
        "payload_sha256": payload_hash(payload),
        "payload": payload,
    }
    atomic_write_json(artifact_path(doc_dir, stage), art, indent=None)
    return art


def run_cached_stage(
    doc_dir: Path,
    stage: str,
    key: str,
    fn: Callable[[], dict[str, Any]],
    counts: Callable[[dict[str, Any]], dict[str, Any]],
    *,
    valid: Callable[[dict[str, Any]], bool] | None = None,
    after: Callable[[StageReport], None] | None = None,
    stop_after: str | None = None,
) -> tuple[dict[str, Any], str, StageReport]:
    """Returns (payload, payload_sha256, report)."""
    t0 = time.monotonic()
    art = load_artifact(doc_dir, stage, key)
    skipped = art is not None and (valid is None or valid(art["payload"]))
    if not skipped:
        payload = fn()
        art = write_artifact(doc_dir, stage, key, payload)
    assert art is not None
    report = StageReport(stage, skipped, int((time.monotonic() - t0) * 1000), counts(art["payload"]))
    if after:
        after(report)
    if stop_after == stage:
        raise StopAfterStage(stage)
    return art["payload"], art["payload_sha256"], report
