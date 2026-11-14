import json

import pytest

from pxw.common.errors import ObjectNotFound
from pxw.storage import keys
from pxw.storage.local import LocalObjectStore
from pxw.storage.r2 import R2ObjectStore

SHA = "ab" + "c" * 62


def test_key_builders_match_edge_r2keys():
    assert keys.source_document("NTA", 2024, SHA, "pdf") == f"sources/NTA/2024/{SHA}.pdf"
    assert keys.derived_crop("doc-1", "12", 2) == "derived/doc-1/crops/q12-2.png"
    assert keys.derived_crop("doc-1", "1-CHEMISTRY", 1) == "derived/doc-1/crops/q1-CHEMISTRY-1.png"
    assert keys.derived_crop("doc-1", "../x", 1) == "derived/doc-1/crops/q.._x-1.png"
    assert keys.public_asset(SHA, "png") == f"assets/ab/{SHA}.png"
    assert keys.user_upload("u1", "2026-11", "id9", "png") == "u/u1/2026-11/id9.png"
    assert keys.backup("2026-11-14") == "backups/2026-11-14/db.sql.gz"


def test_local_store_layout_and_sidecar(tmp_path):
    s = LocalObjectStore(tmp_path)
    s.put("SOURCE_DOCS", "sources/NTA/2024/x.pdf", b"abc", "application/pdf")
    assert (tmp_path / "SOURCE_DOCS" / "sources" / "NTA" / "2024" / "x.pdf").read_bytes() == b"abc"
    meta = tmp_path / "SOURCE_DOCS" / "sources" / "NTA" / "2024" / "x.pdf.meta.json"
    assert json.loads(meta.read_text()) == {"contentType": "application/pdf"}
    assert s.get("SOURCE_DOCS", "sources/NTA/2024/x.pdf") == b"abc"
    assert s.exists("SOURCE_DOCS", "sources/NTA/2024/x.pdf") and not s.exists("PUBLIC_ASSETS", "sources/NTA/2024/x.pdf")
    s.put("SOURCE_DOCS", "sources/NTA/2024/x.pdf", b"abcd", "application/pdf")  # overwrite is fine
    assert s.get("SOURCE_DOCS", "sources/NTA/2024/x.pdf") == b"abcd"
    with pytest.raises(ObjectNotFound):
        s.get("SOURCE_DOCS", "nope")


@pytest.mark.parametrize("bad", ["../escape", "a/../../b", "/abs", "a\\b", ""])
def test_local_store_rejects_unsafe_keys(tmp_path, bad):
    with pytest.raises(ValueError):
        LocalObjectStore(tmp_path).put("SOURCE_DOCS", bad, b"x", "text/plain")


class FakeS3:
    class ClientError(Exception):
        def __init__(self, code, status):
            self.response = {"Error": {"Code": code}, "ResponseMetadata": {"HTTPStatusCode": status}}

    def __init__(self):
        self.objects, self.calls = {}, []

    def put_object(self, Bucket, Key, Body, ContentType):
        self.calls.append(("put", Bucket, Key, ContentType))
        self.objects[(Bucket, Key)] = Body

    def get_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise self.ClientError("NoSuchKey", 404)

        class Body:
            def __init__(self, b):
                self.b = b

            def read(self):
                return self.b

        return {"Body": Body(self.objects[(Bucket, Key)])}

    def head_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise self.ClientError("404", 404)
        return {}


def test_r2_store_maps_buckets_and_errors():
    fake = FakeS3()
    s = R2ObjectStore("acct", "kid", "secret", {"SOURCE_DOCS": "projectx-source-docs",
                                               "PUBLIC_ASSETS": "projectx-public-assets"}, client=fake)
    s.put("SOURCE_DOCS", "k", b"data", "application/pdf")
    assert fake.calls == [("put", "projectx-source-docs", "k", "application/pdf")]
    assert s.get("SOURCE_DOCS", "k") == b"data" and s.exists("SOURCE_DOCS", "k")
    assert not s.exists("PUBLIC_ASSETS", "k")
    with pytest.raises(ObjectNotFound):
        s.get("PUBLIC_ASSETS", "k")
    with pytest.raises(ValueError):
        s.put("USER_UPLOADS", "k", b"x", "image/png")


def test_r2_endpoint_is_account_scoped(monkeypatch):
    seen = {}

    def fake_client(service, **kw):
        seen.update(service=service, **kw)
        return FakeS3()

    import boto3

    monkeypatch.setattr(boto3, "client", fake_client)
    R2ObjectStore("acct123", "kid", "sec", {"SOURCE_DOCS": "b"}).exists("SOURCE_DOCS", "k")
    assert seen["endpoint_url"] == "https://acct123.r2.cloudflarestorage.com" and seen["region_name"] == "auto"


def test_factory_requires_r2_credentials():
    from pxw.config import ConfigError, Settings
    from pxw.storage.factory import make_object_store

    with pytest.raises(ConfigError):
        make_object_store(Settings(), "r2")
    assert isinstance(make_object_store(Settings(), "local"), LocalObjectStore)
