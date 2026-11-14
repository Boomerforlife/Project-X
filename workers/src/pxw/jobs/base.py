"""JobStore protocol."""

from __future__ import annotations

from typing import Protocol

from pxw.common.models import Job, JobKind, JobStatus


class JobStore(Protocol):
    def enqueue(
        self,
        kind: JobKind,
        idempotency_key: str,
        payload: dict,
        *,
        source_document_id: str | None = None,
        priority: int = 100,
    ) -> str: ...

    def claim(self, worker_id: str, kinds: list[JobKind], lease_seconds: int = 600) -> Job | None: ...

    def heartbeat(self, job_id: str, worker_id: str, lease_seconds: int = 600) -> bool: ...

    def complete(self, job_id: str, worker_id: str, result: dict) -> bool: ...

    def fail(self, job_id: str, worker_id: str, error: str, retryable: bool = True) -> JobStatus: ...

    def log(self, job_id: str, level: str, stage: str | None, message: str, data: dict | None = None) -> None: ...


def backoff_seconds(attempts: int) -> int:
    """least(3600, 30 * 2^(attempts-1)) -- identical to app_private.fail_pipeline_job."""
    return min(3600, 30 * 2 ** max(attempts - 1, 0))
