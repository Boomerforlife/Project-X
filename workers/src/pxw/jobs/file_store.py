"""FileJobStore: JSON file + lock file under PXW_WORK_DIR/jobs.json. Same semantics as the SQL functions."""

from __future__ import annotations

import json
import os
import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from pxw.common.jsonio import atomic_write_json
from pxw.common.models import Job, JobKind, JobStatus
from pxw.jobs.base import backoff_seconds

Clock = Callable[[], datetime]


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _parse(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s) if s else None


class FileJobStore:
    def __init__(self, path: str | Path, *, clock: Clock | None = None, lock_timeout: float = 10.0) -> None:
        p = Path(path)
        self.path = p / "jobs.json" if p.suffix == "" else p
        self.lock_path = self.path.with_name(self.path.name + ".lock")
        self.clock: Clock = clock or _utcnow
        self.lock_timeout = lock_timeout

    # -- storage --------------------------------------------------------------------------------

    @contextmanager
    def _locked(self) -> Iterator[dict[str, Any]]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + self.lock_timeout
        while True:
            try:
                fd = os.open(str(self.lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(fd)
                break
            except FileExistsError:
                try:  # break stale locks (crashed holder)
                    if time.time() - self.lock_path.stat().st_mtime > 30:
                        self.lock_path.unlink()
                        continue
                except OSError:
                    pass
                if time.monotonic() > deadline:
                    raise TimeoutError(f"could not acquire {self.lock_path}") from None
                time.sleep(0.02)
        try:
            data = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}
            data.setdefault("jobs", {})
            data.setdefault("events", [])
            yield data
            atomic_write_json(self.path, data, indent=None)
        finally:
            try:
                self.lock_path.unlink()
            except OSError:
                pass

    @staticmethod
    def _to_job(r: dict[str, Any]) -> Job:
        return Job(
            id=r["id"],
            kind=r["kind"],
            idempotency_key=r["idempotency_key"],
            status=r["status"],
            priority=r["priority"],
            payload=r["payload"],
            result=r.get("result"),
            attempts=r["attempts"],
            max_attempts=r["max_attempts"],
            source_document_id=r.get("source_document_id"),
            locked_by=r.get("locked_by"),
            last_error=r.get("last_error"),
        )

    # -- JobStore -------------------------------------------------------------------------------

    def enqueue(
        self,
        kind: JobKind,
        idempotency_key: str,
        payload: dict,
        *,
        source_document_id: str | None = None,
        priority: int = 100,
    ) -> str:
        with self._locked() as data:
            for r in data["jobs"].values():
                if r["idempotency_key"] == idempotency_key:
                    return r["id"]
            now = self.clock()
            jid = str(uuid.uuid4())
            data["jobs"][jid] = {
                "id": jid,
                "kind": kind,
                "idempotency_key": idempotency_key,
                "status": "QUEUED",
                "priority": priority,
                "payload": payload,
                "result": None,
                "attempts": 0,
                "max_attempts": 5,
                "run_after": _iso(now),
                "locked_by": None,
                "locked_at": None,
                "lease_expires_at": None,
                "last_error": None,
                "source_document_id": source_document_id,
                "created_at": _iso(now),
                "started_at": None,
                "finished_at": None,
            }
            return jid

    def claim(self, worker_id: str, kinds: list[JobKind], lease_seconds: int = 600) -> Job | None:
        with self._locked() as data:
            now = self.clock()
            while True:
                cands = []
                for r in data["jobs"].values():
                    if r["kind"] not in kinds:
                        continue
                    queued = r["status"] == "QUEUED" and _parse(r["run_after"]) <= now  # type: ignore[operator]
                    expired = (
                        r["status"] == "RUNNING"
                        and r["lease_expires_at"] is not None
                        and _parse(r["lease_expires_at"]) < now  # type: ignore[operator]
                    )
                    if queued or expired:
                        cands.append(r)
                if not cands:
                    return None
                cands.sort(key=lambda r: (r["priority"], r["run_after"], r["created_at"]))
                r = cands[0]
                if r["attempts"] + 1 > r["max_attempts"]:
                    r["status"] = "DEAD"
                    r["finished_at"] = _iso(now)
                    r["last_error"] = r["last_error"] or "max attempts exceeded"
                    continue
                r["status"] = "RUNNING"
                r["attempts"] += 1
                r["locked_by"] = worker_id
                r["locked_at"] = _iso(now)
                r["lease_expires_at"] = _iso(now + timedelta(seconds=lease_seconds))
                r["started_at"] = r["started_at"] or _iso(now)
                return self._to_job(r)

    def heartbeat(self, job_id: str, worker_id: str, lease_seconds: int = 600) -> bool:
        with self._locked() as data:
            r = data["jobs"].get(job_id)
            if not r or r["status"] != "RUNNING" or r["locked_by"] != worker_id:
                return False
            r["lease_expires_at"] = _iso(self.clock() + timedelta(seconds=lease_seconds))
            return True

    def complete(self, job_id: str, worker_id: str, result: dict) -> bool:
        with self._locked() as data:
            r = data["jobs"].get(job_id)
            if not r or r["status"] != "RUNNING" or r["locked_by"] != worker_id:
                return False
            r["status"] = "SUCCEEDED"
            r["result"] = result
            r["finished_at"] = _iso(self.clock())
            r["lease_expires_at"] = None
            return True

    def fail(self, job_id: str, worker_id: str, error: str, retryable: bool = True) -> JobStatus:
        with self._locked() as data:
            r = data["jobs"].get(job_id)
            if not r:
                raise KeyError(job_id)
            now = self.clock()
            r["last_error"] = error[:4000]
            r["lease_expires_at"] = None
            if retryable and r["attempts"] < r["max_attempts"]:
                r["status"] = "QUEUED"
                r["run_after"] = _iso(now + timedelta(seconds=backoff_seconds(r["attempts"])))
                r["locked_by"] = None
            else:
                r["status"] = "DEAD"
                r["finished_at"] = _iso(now)
            return r["status"]

    def log(self, job_id: str, level: str, stage: str | None, message: str, data: dict | None = None) -> None:
        with self._locked() as d:
            d["events"].append(
                {
                    "job_id": job_id,
                    "level": level,
                    "stage": stage,
                    "message": message[:2000],
                    "data": data,
                    "created_at": _iso(self.clock()),
                }
            )

    # -- extras (tests / CLI) -------------------------------------------------------------------

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._locked() as data:
            r = data["jobs"].get(job_id)
            return dict(r) if r else None

    def events(self, job_id: str | None = None) -> list[dict[str, Any]]:
        with self._locked() as data:
            return [e for e in data["events"] if job_id is None or e["job_id"] == job_id]
