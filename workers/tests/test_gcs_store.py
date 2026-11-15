"""GCS store tests with a fake client (offline). The real bucket is exercised manually, not in CI."""

from __future__ import annotations

import pytest

from pxw.common.errors import ObjectNotFound
from pxw.config import ConfigError, Settings
from pxw.storage.factory import make_object_store
from pxw.storage.gcs import GcsObjectStore


class NotFound(Exception):
    code = 404


class _Blob:
    def __init__(self, store: dict, key: tuple[str, str]) -> None:
        self.store, self.key = store, key

    def upload_from_string(self, data: bytes, content_type: str) -> None:
        self.store[self.key] = (data, content_type)

    def download_as_bytes(self) -> bytes:
        if self.key not in self.store:
            raise NotFound("missing")
        return self.store[self.key][0]

    def exists(self) -> bool:
        return self.key in self.store


class _Client:
    def __init__(self) -> None:
        self.store: dict = {}

    def bucket(self, name: str):
        client = self

        class _B:
            def blob(self, key: str) -> _Blob:
                return _Blob(client.store, (name, key))

        return _B()


def test_round_trip_and_not_found():
    c = _Client()
    s = GcsObjectStore({"SOURCE_DOCS": "b-src"}, client=c)
    assert not s.exists("SOURCE_DOCS", "sources/X/2099/abc.pdf")
    with pytest.raises(ObjectNotFound):
        s.get("SOURCE_DOCS", "sources/X/2099/abc.pdf")
    s.put("SOURCE_DOCS", "sources/X/2099/abc.pdf", b"%PDF-1", "application/pdf")
    assert s.exists("SOURCE_DOCS", "sources/X/2099/abc.pdf")
    assert s.get("SOURCE_DOCS", "sources/X/2099/abc.pdf") == b"%PDF-1"
    assert c.store[("b-src", "sources/X/2099/abc.pdf")][1] == "application/pdf"
    with pytest.raises(ValueError):
        s.put("USER_UPLOADS", "k", b"x", "text/plain")


def test_factory_requires_bucket_names():
    with pytest.raises(ConfigError, match="GCS_BUCKET_SOURCE_DOCS"):
        make_object_store(Settings(storage_driver="gcs"))
    st = make_object_store(
        Settings(
            storage_driver="gcs", gcs_bucket_source_docs="a", gcs_bucket_public_assets="b", gcs_bucket_user_uploads="c"
        )
    )
    assert isinstance(st, GcsObjectStore)
