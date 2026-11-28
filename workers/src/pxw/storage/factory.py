"""Build an ObjectStore from Settings."""

from __future__ import annotations

from pxw.config import ConfigError, Settings
from pxw.storage.base import ObjectStore
from pxw.storage.local import LocalObjectStore


def make_object_store(settings: Settings, driver: str | None = None) -> ObjectStore:
    d = (driver or settings.storage_driver).lower()
    if d == "local":
        return LocalObjectStore(settings.local_storage_dir)
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
    raise ConfigError(f"unknown storage driver {d!r} (expected local|gcs)")
