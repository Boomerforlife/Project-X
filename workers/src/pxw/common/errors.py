"""Exception types. PermanentError subclasses are never retried by the job runner."""

from __future__ import annotations


class PxwError(Exception):
    """Base class."""


class PermanentError(PxwError):
    """Job must fail with retryable=False."""


class SourceNotApproved(PermanentError):
    """Source is not (reuse_permitted and approved_at) -> CLI exit code 3."""


class ChecksumMismatch(PermanentError):
    pass


class UnsupportedLayout(PermanentError):
    pass


class ObjectNotFound(PxwError):
    pass


class StopAfterStage(PxwError):
    """Raised by tests/hooks to simulate a crash after a stage."""

    def __init__(self, stage: str) -> None:
        super().__init__(f"stopped after stage {stage}")
        self.stage = stage
