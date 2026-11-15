"""Build an ObjectStore from Settings."""

from __future__ import annotations

from pxw.config import ConfigError, Settings
from pxw.storage.base import ObjectStore
from pxw.storage.local import LocalObjectStore
from pxw.storage.r2 import R2ObjectStore


def make_object_store(settings: Settings, driver: str | None = None) -> ObjectStore:
    d = (driver or settings.storage_driver).lower()
    if d == "local":
        return LocalObjectStore(settings.local_storage_dir)
    if d == "r2":
        if not (settings.r2_account_id and settings.r2_access_key_id and settings.r2_secret_access_key):
            raise ConfigError("R2 storage needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
        return R2ObjectStore(
            settings.r2_account_id,
            settings.r2_access_key_id,
            settings.r2_secret_access_key,
            {
                "SOURCE_DOCS": settings.r2_bucket_source_docs,
                "PUBLIC_ASSETS": settings.r2_bucket_public_assets,
                "USER_UPLOADS": settings.r2_bucket_user_uploads,
            },
        )
    if d == "gcs":
        names = {
            "SOURCE_DOCS": settings.gcs_bucket_source_docs,
            "PUBLIC_ASSETS": settings.gcs_bucket_public_assets,
            "USER_UPLOADS": settings.gcs_bucket_user_uploads,
        }
        missing = [k for k, v in names.items() if not v]
        if missing:
            raise ConfigError("GCS storage needs " + ", ".join(f"GCS_BUCKET_{k}" for k in missing))
        from pxw.storage.gcs import GcsObjectStore

        return GcsObjectStore({k: v for k, v in names.items() if v}, project=settings.gcs_project)
    raise ConfigError(f"unknown storage driver {d!r} (expected local|r2|gcs)")
