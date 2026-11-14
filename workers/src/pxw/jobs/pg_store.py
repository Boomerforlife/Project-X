"""PgJobStore: thin wrapper over app_private.*_pipeline_job functions (DATABASE_SCHEMA 0007)."""

from __future__ import annotations

from typing import Any

from psycopg.types.json import Jsonb

from pxw.common.models import Job, JobKind, JobStatus
from pxw.db.pg import run


class PgJobStore:
    def __init__(self, database_url: str) -> None:
        self.url = database_url

    def enqueue(
        self,
        kind: JobKind,
        idempotency_key: str,
        payload: dict,
        *,
        source_document_id: str | None = None,
        priority: int = 100,
    ) -> str:
        def fn(cur: Any) -> str:
            cur.execute(
                "select app_private.enqueue_pipeline_job("
                "%s::job_kind, %s, %s, %s, now(), null, %s::uuid, null) as id",
                (kind, idempotency_key, Jsonb(payload), priority, source_document_id),
            )
            return str(cur.fetchone()["id"])

        return run(self.url, fn)

    def claim(self, worker_id: str, kinds: list[JobKind], lease_seconds: int = 600) -> Job | None:
        def fn(cur: Any) -> Job | None:
            cur.execute(
                "select * from app_private.claim_pipeline_job(%s, %s::job_kind[], %s)",
                (worker_id, list(kinds), lease_seconds),
            )
            row = cur.fetchone()
            if not row or row.get("id") is None:
                return None
            return Job(
                id=str(row["id"]),
                kind=row["kind"],
                idempotency_key=row["idempotency_key"],
                status=row["status"],
                priority=row["priority"],
                payload=row["payload"] or {},
                result=row.get("result"),
                attempts=row["attempts"],
                max_attempts=row["max_attempts"],
                source_document_id=str(row["source_document_id"]) if row.get("source_document_id") else None,
                locked_by=row.get("locked_by"),
                last_error=row.get("last_error"),
            )

        return run(self.url, fn)

    def heartbeat(self, job_id: str, worker_id: str, lease_seconds: int = 600) -> bool:
        def fn(cur: Any) -> bool:
            cur.execute(
                "select app_private.heartbeat_pipeline_job(%s::uuid, %s, %s) as ok", (job_id, worker_id, lease_seconds)
            )
            return bool(cur.fetchone()["ok"])

        return run(self.url, fn)

    def complete(self, job_id: str, worker_id: str, result: dict) -> bool:
        def fn(cur: Any) -> bool:
            cur.execute(
                "select app_private.complete_pipeline_job(%s::uuid, %s, %s) as ok", (job_id, worker_id, Jsonb(result))
            )
            return bool(cur.fetchone()["ok"])

        return run(self.url, fn)

    def fail(self, job_id: str, worker_id: str, error: str, retryable: bool = True) -> JobStatus:
        def fn(cur: Any) -> JobStatus:
            cur.execute(
                "select app_private.fail_pipeline_job(%s::uuid, %s, %s, %s)::text as st",
                (job_id, worker_id, error, retryable),
            )
            return cur.fetchone()["st"]

        return run(self.url, fn)

    def log(self, job_id: str, level: str, stage: str | None, message: str, data: dict | None = None) -> None:
        def fn(cur: Any) -> None:
            cur.execute(
                "select app_private.log_pipeline_job_event(%s::uuid, %s::job_event_level, %s, %s, %s)",
                (job_id, level, stage, message[:2000], Jsonb(data) if data is not None else None),
            )

        run(self.url, fn)
