"""ObjectStore protocol."""

from __future__ import annotations

from typing import Protocol

from pxw.common.models import BucketName


class ObjectStore(Protocol):
    def put(self, bucket: BucketName, key: str, data: bytes, content_type: str) -> None: ...

    def get(self, bucket: BucketName, key: str) -> bytes: ...

    def exists(self, bucket: BucketName, key: str) -> bool: ...
