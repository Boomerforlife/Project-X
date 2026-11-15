"""Google Cloud Storage (google-cloud-storage, imported lazily). Auth = Application Default Credentials
(Cloud Run Jobs service account in the cloud; `gcloud auth application-default login` on a laptop)."""

from __future__ import annotations

from typing import Any

from pxw.common.errors import ObjectNotFound
from pxw.common.models import BucketName


class GcsObjectStore:
    def __init__(self, bucket_names: dict[str, str], *, project: str | None = None, client: Any | None = None) -> None:
        self.bucket_names = bucket_names
        self._project = project
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            from google.cloud import storage  # lazy: keeps offline paths light

            self._client = storage.Client(project=self._project)
        return self._client

    def _blob(self, bucket: BucketName, key: str) -> Any:
        try:
            name = self.bucket_names[bucket]
        except KeyError as exc:
            raise ValueError(f"no GCS bucket name configured for {bucket}") from exc
        return self.client.bucket(name).blob(key)

    def put(self, bucket: BucketName, key: str, data: bytes, content_type: str) -> None:
        self._blob(bucket, key).upload_from_string(data, content_type=content_type)

    def get(self, bucket: BucketName, key: str) -> bytes:
        try:
            return self._blob(bucket, key).download_as_bytes()
        except Exception as exc:  # google.api_core.exceptions.NotFound
            if _is_not_found(exc):
                raise ObjectNotFound(f"{bucket}/{key}") from exc
            raise

    def exists(self, bucket: BucketName, key: str) -> bool:
        return bool(self._blob(bucket, key).exists())


def _is_not_found(exc: Exception) -> bool:
    return getattr(exc, "code", None) == 404 or type(exc).__name__ == "NotFound"
