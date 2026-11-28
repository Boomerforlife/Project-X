"""Object key builders. Must equal @projectx/edge r2Keys."""

from __future__ import annotations

import re


def source_document(source_code: str, year: int, sha256: str, ext: str) -> str:
    return f"sources/{source_code}/{year}/{sha256}.{ext.lstrip('.')}"


def _safe_num(question_number: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", question_number)


def derived_crop(source_document_id: str, question_number: str, n: int) -> str:
    return f"derived/{source_document_id}/crops/q{_safe_num(question_number)}-{n}.png"


def public_asset(sha256: str, ext: str) -> str:
    return f"assets/{sha256[:2]}/{sha256}.{ext.lstrip('.')}"


def user_upload(user_id: str, yyyy_mm: str, upload_id: str, ext: str) -> str:
    return f"u/{user_id}/{yyyy_mm}/{upload_id}.{ext.lstrip('.')}"


def backup(date: str) -> str:
    return f"backups/{date}/db.sql.gz"
