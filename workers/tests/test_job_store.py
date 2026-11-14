from datetime import UTC, datetime, timedelta

import pytest

from pxw.common.errors import PermanentError
from pxw.jobs.base import backoff_seconds
from pxw.jobs.file_store import FileJobStore
from pxw.jobs.runner import JobRunner


class Clock:
    def __init__(self):
        self.now = datetime(2026, 1, 1, tzinfo=UTC)

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += timedelta(seconds=seconds)


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def store(tmp_path, clock):
    return FileJobStore(tmp_path / "jobs.json", clock=clock)


def test_enqueue_is_idempotent(store):
    a = store.enqueue("PROCESS_DOCUMENT", "PROCESS_DOCUMENT:d1:v1", {"x": 1}, source_document_id="d1")
    b = store.enqueue("PROCESS_DOCUMENT", "PROCESS_DOCUMENT:d1:v1", {"x": 2})
    assert a == b
    assert store.get(a)["payload"] == {"x": 1}


def test_claim_order_kinds_and_ownership(store):
    low = store.enqueue("PROCESS_DOCUMENT", "k-low", {}, priority=200)
    high = store.enqueue("PROCESS_DOCUMENT", "k-high", {}, priority=10)
    other = store.enqueue("PARSE_ANSWER_KEY", "k-key", {}, priority=1)
    j = store.claim("w1", ["PROCESS_DOCUMENT"])
    assert j.id == high and j.status == "RUNNING" and j.attempts == 1 and j.locked_by == "w1"
    assert store.claim("w2", ["PROCESS_DOCUMENT"]).id == low
    assert store.claim("w2", ["PROCESS_DOCUMENT"]) is None
    assert store.claim("w3", ["PARSE_ANSWER_KEY"]).id == other
    assert store.complete(high, "w2", {}) is False  # not the owner
    assert store.complete(high, "w1", {"ok": True}) is True
    assert store.get(high)["status"] == "SUCCEEDED" and store.get(high)["result"] == {"ok": True}
    assert store.complete(high, "w1", {}) is False  # no longer RUNNING


def test_lease_expiry_allows_reclaim_and_heartbeat_extends(store, clock):
    jid = store.enqueue("PROCESS_DOCUMENT", "k", {})
    store.claim("w1", ["PROCESS_DOCUMENT"], lease_seconds=60)
    clock.advance(30)
    assert store.claim("w2", ["PROCESS_DOCUMENT"]) is None
    assert store.heartbeat(jid, "w1", lease_seconds=60) is True
    assert store.heartbeat(jid, "w2") is False
    clock.advance(45)  # 75s after claim but only 45s after heartbeat
    assert store.claim("w2", ["PROCESS_DOCUMENT"]) is None
    clock.advance(30)
    j = store.claim("w2", ["PROCESS_DOCUMENT"])
    assert j.id == jid and j.attempts == 2 and j.locked_by == "w2"
    assert store.heartbeat(jid, "w1") is False  # lost the lease


def test_fail_backoff_then_dead(store, clock):
    assert [backoff_seconds(n) for n in (1, 2, 3, 8, 20)] == [30, 60, 120, 3600, 3600]
    jid = store.enqueue("PROCESS_DOCUMENT", "k", {})
    expected = [30, 60, 120, 240]
    for attempt, wait in enumerate(expected, 1):
        j = store.claim("w", ["PROCESS_DOCUMENT"])
        assert j.attempts == attempt
        assert store.fail(jid, "w", "boom") == "QUEUED"
        assert store.claim("w", ["PROCESS_DOCUMENT"]) is None  # backing off
        clock.advance(wait - 1)
        assert store.claim("w", ["PROCESS_DOCUMENT"]) is None
        clock.advance(1)
    store.claim("w", ["PROCESS_DOCUMENT"])  # attempt 5 == max_attempts
    assert store.fail(jid, "w", "x" * 5000) == "DEAD"
    rec = store.get(jid)
    assert rec["status"] == "DEAD" and len(rec["last_error"]) == 4000 and rec["attempts"] == 5
    clock.advance(10_000)
    assert store.claim("w", ["PROCESS_DOCUMENT"]) is None


def test_non_retryable_fail_is_dead_immediately(store):
    jid = store.enqueue("PROCESS_DOCUMENT", "k", {})
    store.claim("w", ["PROCESS_DOCUMENT"])
    assert store.fail(jid, "w", "nope", retryable=False) == "DEAD"


def test_expired_lease_with_exhausted_attempts_goes_dead(store, clock):
    jid = store.enqueue("PROCESS_DOCUMENT", "k", {})
    for _ in range(5):
        assert store.claim("w", ["PROCESS_DOCUMENT"], lease_seconds=10) is not None
        clock.advance(11)
    assert store.claim("w", ["PROCESS_DOCUMENT"]) is None
    assert store.get(jid)["status"] == "DEAD"


def test_log_events(store):
    jid = store.enqueue("PROCESS_DOCUMENT", "k", {})
    store.log(jid, "INFO", "extract", "m" * 3000, {"counts": 1})
    ev = store.events(jid)
    assert len(ev) == 1 and ev[0]["stage"] == "extract" and len(ev[0]["message"]) == 2000


def test_two_instances_share_state(tmp_path, clock):
    a = FileJobStore(tmp_path / "jobs.json", clock=clock)
    b = FileJobStore(tmp_path / "jobs.json", clock=clock)
    jid = a.enqueue("PROCESS_DOCUMENT", "k", {})
    assert b.enqueue("PROCESS_DOCUMENT", "k", {}) == jid
    assert b.claim("w", ["PROCESS_DOCUMENT"]).id == jid
    assert a.claim("w2", ["PROCESS_DOCUMENT"]) is None


def test_runner_success_retry_and_permanent(store, clock):
    class Boom(Exception):
        pass

    def ok(job, ctx):
        ctx.heartbeat()
        ctx.log("INFO", "s", "hi")
        return {"done": job.payload["n"]}

    def flaky(job, ctx):
        raise Boom("io")

    def perm(job, ctx):
        raise PermanentError("never")

    j_ok = store.enqueue("PROCESS_DOCUMENT", "ok", {"n": 1}, priority=1)
    j_flaky = store.enqueue("PARSE_ANSWER_KEY", "flaky", {}, priority=2)
    j_perm = store.enqueue("AI_SEO", "perm", {}, priority=3)
    runner = JobRunner(store, {"PROCESS_DOCUMENT": ok, "PARSE_ANSWER_KEY": flaky, "AI_SEO": perm}, "w")
    summary = runner.run(max_jobs=10)
    assert (summary.processed, summary.succeeded, summary.retried, summary.dead) == (3, 1, 1, 1)
    assert store.get(j_ok)["status"] == "SUCCEEDED" and store.get(j_ok)["result"] == {"done": 1}
    assert store.get(j_flaky)["status"] == "QUEUED" and "Boom" in store.get(j_flaky)["last_error"]
    assert store.get(j_perm)["status"] == "DEAD" and store.get(j_perm)["attempts"] == 1
