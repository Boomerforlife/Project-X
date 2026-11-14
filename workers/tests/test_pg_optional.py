"""Postgres-backed paths. Skipped unless PXW_TEST_DATABASE_URL points at a migrated+seeded DB (`npm run db:serve`)."""

from __future__ import annotations

import os
import uuid

import pytest

URL = os.environ.get("PXW_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not URL, reason="PXW_TEST_DATABASE_URL not set (start `npm run db:serve` and export "
                    "PXW_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres to run)"
)


def test_pg_job_store_roundtrip():
    from pxw.jobs.pg_store import PgJobStore

    store = PgJobStore(URL)
    key = f"PXW_TEST:{uuid.uuid4()}"
    jid = store.enqueue("PROCESS_DOCUMENT", key, {"a": 1})
    assert store.enqueue("PROCESS_DOCUMENT", key, {"a": 2}) == jid
    job = store.claim("pxw-test", ["PROCESS_DOCUMENT"])
    assert job is not None and job.status == "RUNNING"
    claimed = job
    assert store.heartbeat(claimed.id, "pxw-test") is True
    store.log(claimed.id, "INFO", "extract", "hello", {"n": 1})
    assert store.complete(claimed.id, "pxw-test", {"ok": True}) is True
    assert store.heartbeat(claimed.id, "other") is False


def test_pg_repo_source_approval_and_paper_upsert():
    from pxw.common.errors import SourceNotApproved
    from pxw.common.models import PaperIn
    from pxw.db.pg_repo import PgIngestionRepo

    repo = PgIngestionRepo(URL)
    with pytest.raises(SourceNotApproved):
        repo.get_source("NTA")  # seeded as not approved
    assert repo.get_source("PROJECTX_EDITORIAL").code == "PROJECTX_EDITORIAL"
    slug = f"pxw-test-{uuid.uuid4().hex[:8]}"
    pid = repo.upsert_paper(PaperIn(slug=slug, title="PXW test", year=2024, exam_date="2024-01-27", shift=1,
                                    paper_code=slug))
    assert repo.upsert_paper(PaperIn(slug=slug, title="PXW test 2", year=2024, exam_date="2024-01-27", shift=1,
                                     paper_code=slug)) == pid
