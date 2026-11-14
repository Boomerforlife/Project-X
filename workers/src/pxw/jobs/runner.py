"""Job runner: claim -> handler -> complete/fail. Permanent errors are never retried."""

from __future__ import annotations

import traceback
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from pxw.common.errors import PermanentError
from pxw.common.logging import get_logger
from pxw.common.models import Job, JobKind
from pxw.jobs.base import JobStore

Handler = Callable[[Job, "JobContext"], dict[str, Any]]


@dataclass
class JobContext:
    """Passed to handlers: lets them heartbeat and log without knowing the store."""

    store: JobStore
    job: Job
    worker_id: str
    lease_seconds: int = 600

    def heartbeat(self) -> bool:
        return self.store.heartbeat(self.job.id, self.worker_id, self.lease_seconds)

    def log(self, level: str, stage: str | None, message: str, data: dict | None = None) -> None:
        self.store.log(self.job.id, level, stage, message, data)


@dataclass
class RunSummary:
    processed: int = 0
    succeeded: int = 0
    retried: int = 0
    dead: int = 0
    results: list[dict[str, Any]] = field(default_factory=list)


class JobRunner:
    def __init__(self, store: JobStore, handlers: dict[str, Handler], worker_id: str, lease_seconds: int = 600) -> None:
        self.store = store
        self.handlers = handlers
        self.worker_id = worker_id
        self.lease_seconds = lease_seconds
        self.log = get_logger("runner")

    def run(self, kinds: list[JobKind] | None = None, max_jobs: int = 10) -> RunSummary:
        kinds = kinds or list(self.handlers)  # type: ignore[assignment]
        summary = RunSummary()
        while summary.processed < max_jobs:
            job = self.store.claim(self.worker_id, kinds, self.lease_seconds)
            if job is None:
                break
            summary.processed += 1
            ctx = JobContext(self.store, job, self.worker_id, self.lease_seconds)
            handler = self.handlers.get(job.kind)
            try:
                if handler is None:
                    raise PermanentError(f"no handler for job kind {job.kind}")
                result = handler(job, ctx)
            except PermanentError as exc:
                status = self.store.fail(job.id, self.worker_id, f"{type(exc).__name__}: {exc}", retryable=False)
                self._record(summary, job, status, f"{type(exc).__name__}: {exc}")
            except Exception as exc:  # noqa: BLE001  # retryable (IO / DB / transient)
                self.log.warning("job %s failed: %s", job.id, traceback.format_exc())
                status = self.store.fail(job.id, self.worker_id, f"{type(exc).__name__}: {exc}", retryable=True)
                self._record(summary, job, status, f"{type(exc).__name__}: {exc}")
            else:
                if self.store.complete(job.id, self.worker_id, result):
                    summary.succeeded += 1
                    summary.results.append({"job_id": job.id, "kind": job.kind, "status": "SUCCEEDED", "result": result})
                else:
                    summary.results.append({"job_id": job.id, "kind": job.kind, "status": "LEASE_LOST"})
        return summary

    @staticmethod
    def _record(summary: RunSummary, job: Job, status: str, error: str) -> None:
        if status == "DEAD":
            summary.dead += 1
        else:
            summary.retried += 1
        summary.results.append({"job_id": job.id, "kind": job.kind, "status": status, "error": error})
