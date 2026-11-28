"""Environment -> Settings."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

from pydantic import BaseModel, Field

PIPELINE_VERSION = "v2"  # v2: NTA image layout with OCR text (2026-11-17)


class ConfigError(Exception):
    """Missing/invalid configuration (CLI exit code 2)."""


class Settings(BaseModel):
    work_dir: Path = Path(".local/work")
    job_store: str = "file"
    storage_driver: str = "local"
    local_storage_dir: Path = Path(".local/storage")
    ocr_engines: list[str] = Field(default_factory=lambda: ["rapidocr", "paddle", "tesseract"])
    ocr_min_confidence: float = 0.6
    database_url: str | None = None
    gcs_project: str | None = None
    gcs_bucket_source_docs: str | None = None
    gcs_bucket_public_assets: str | None = None
    gcs_bucket_user_uploads: str | None = None
    log_level: str = "info"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        e = os.environ if env is None else env

        def g(name: str, default: str | None = None) -> str | None:
            v = e.get(name)
            return v if v not in (None, "") else default

        engines = g("OCR_ENGINES", "rapidocr,paddle,tesseract") or ""
        try:
            min_conf = float(g("OCR_MIN_CONFIDENCE", "0.6") or "0.6")
        except ValueError as exc:
            raise ConfigError("OCR_MIN_CONFIDENCE must be a number") from exc
        return cls(
            work_dir=Path(g("PXW_WORK_DIR", ".local/work") or ".local/work"),
            job_store=(g("PXW_JOB_STORE", "file") or "file").lower(),
            storage_driver=(g("STORAGE_DRIVER", "local") or "local").lower(),
            local_storage_dir=Path(g("LOCAL_STORAGE_DIR", ".local/storage") or ".local/storage"),
            ocr_engines=[x.strip() for x in engines.split(",") if x.strip()],
            ocr_min_confidence=min_conf,
            database_url=g("DATABASE_URL"),
            gcs_project=g("GCS_PROJECT"),
            gcs_bucket_source_docs=g("GCS_BUCKET_SOURCE_DOCS"),
            gcs_bucket_public_assets=g("GCS_BUCKET_PUBLIC_ASSETS"),
            gcs_bucket_user_uploads=g("GCS_BUCKET_USER_UPLOADS"),
            log_level=(g("LOG_LEVEL", "info") or "info").lower(),
        )
