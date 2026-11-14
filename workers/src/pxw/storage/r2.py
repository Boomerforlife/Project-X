"""Cloudflare R2 via the S3 API (boto3, imported lazily)."""

from __future__ import annotations

from typing import Any

from pxw.common.errors import ObjectNotFound
from pxw.common.models import BucketName


class R2ObjectStore:
    def __init__(
        self,
        account_id: str,
        key_id: str,
        secret: str,
        bucket_names: dict[str, str],
        *,
        client: Any | None = None,
    ) -> None:
        self.bucket_names = bucket_names
        self._account_id = account_id
        self._key_id = key_id
        self._secret = secret
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            import boto3  # lazy: keeps offline paths light

            self._client = boto3.client(
                "s3",
                endpoint_url=f"https://{self._account_id}.r2.cloudflarestorage.com",
                aws_access_key_id=self._key_id,
                aws_secret_access_key=self._secret,
                region_name="auto",
            )
        return self._client

    def _bucket(self, bucket: BucketName) -> str:
        try:
            return self.bucket_names[bucket]
        except KeyError as exc:
            raise ValueError(f"no R2 bucket name configured for {bucket}") from exc

    def put(self, bucket: BucketName, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self._bucket(bucket), Key=key, Body=data, ContentType=content_type)

    def get(self, bucket: BucketName, key: str) -> bytes:
        try:
            resp = self.client.get_object(Bucket=self._bucket(bucket), Key=key)
        except Exception as exc:  # botocore ClientError NoSuchKey
            if _is_not_found(exc):
                raise ObjectNotFound(f"{bucket}/{key}") from exc
            raise
        return resp["Body"].read()

    def exists(self, bucket: BucketName, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self._bucket(bucket), Key=key)
            return True
        except Exception as exc:
            if _is_not_found(exc):
                return False
            raise


def _is_not_found(exc: Exception) -> bool:
    resp = getattr(exc, "response", None)
    if isinstance(resp, dict):
        code = str(resp.get("Error", {}).get("Code", ""))
        status = resp.get("ResponseMetadata", {}).get("HTTPStatusCode")
        return code in ("404", "NoSuchKey", "NotFound") or status == 404
    return False
