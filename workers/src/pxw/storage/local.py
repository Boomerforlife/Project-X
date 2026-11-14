"""Local filesystem object store: root/<bucket>/<key> + sidecar root/<bucket>/<key>.meta.json."""

from __future__ import annotations

import json
from pathlib import Path

from pxw.common.errors import ObjectNotFound
from pxw.common.jsonio import atomic_write_bytes
from pxw.common.models import BucketName

_BUCKETS = ("SOURCE_DOCS", "PUBLIC_ASSETS", "USER_UPLOADS")


class LocalObjectStore:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)

    def _path(self, bucket: BucketName, key: str) -> Path:
        if bucket not in _BUCKETS:
            raise ValueError(f"unknown bucket {bucket}")
        if not key or key.startswith("/") or "\\" in key or ".." in key.split("/"):
            raise ValueError(f"unsafe object key {key!r}")
        base = (self.root / bucket).resolve()
        p = (base / key).resolve()
        if base not in p.parents:
            raise ValueError(f"unsafe object key {key!r}")
        return p

    def put(self, bucket: BucketName, key: str, data: bytes, content_type: str) -> None:
        p = self._path(bucket, key)
        atomic_write_bytes(p, data)
        meta = json.dumps({"contentType": content_type}).encode("utf-8")
        atomic_write_bytes(p.with_name(p.name + ".meta.json"), meta)

    def get(self, bucket: BucketName, key: str) -> bytes:
        p = self._path(bucket, key)
        if not p.is_file():
            raise ObjectNotFound(f"{bucket}/{key}")
        return p.read_bytes()

    def exists(self, bucket: BucketName, key: str) -> bool:
        return self._path(bucket, key).is_file()

    def content_type(self, bucket: BucketName, key: str) -> str | None:
        p = self._path(bucket, key)
        meta = p.with_name(p.name + ".meta.json")
        if not meta.is_file():
            return None
        return json.loads(meta.read_text(encoding="utf-8")).get("contentType")
