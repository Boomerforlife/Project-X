"""Google Cloud Storage through its S3-compatible XML API (HMAC key, boto3 imported lazily).

Same ObjectStore contract as R2/local. Uses an HMAC key of a service account that has objectAdmin on the
buckets (Cloud Storage > Settings > Interoperability). No new dependency: reuses boto3 like the R2 store.
"""

from __future__ import annotations

from typing import Any

from pxw.storage.r2 import R2ObjectStore

GCS_S3_ENDPOINT = "https://storage.googleapis.com"


class GcsObjectStore(R2ObjectStore):
    def __init__(self, access_id: str, secret: str, bucket_names: dict[str, str], *, client: Any | None = None) -> None:
        super().__init__("", access_id, secret, bucket_names, client=client)

    @property
    def client(self) -> Any:
        if self._client is None:
            import boto3
            from botocore.config import Config

            self._client = boto3.client(
                "s3",
                endpoint_url=GCS_S3_ENDPOINT,
                aws_access_key_id=self._key_id,
                aws_secret_access_key=self._secret,
                region_name="auto",
                # GCS interop does not accept the newer default checksum headers on PutObject.
                config=Config(request_checksum_calculation="when_required", response_checksum_validation="when_required"),
            )
        return self._client
