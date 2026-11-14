"""Layout profile registry."""

from __future__ import annotations

import re
from typing import Any

from pxw.common.errors import UnsupportedLayout
from pxw.extraction.layout_profiles import generic_numbered, nta_cbt_v1
from pxw.extraction.segment import ProfileSpec

PROFILES: dict[str, ProfileSpec] = {
    nta_cbt_v1.SPEC.name: nta_cbt_v1.SPEC,
    generic_numbered.SPEC.name: generic_numbered.SPEC,
}


def get_profile(name: str) -> ProfileSpec:
    try:
        return PROFILES[name]
    except KeyError:
        raise UnsupportedLayout(f"unsupported layout profile {name!r} (known: {', '.join(PROFILES)})") from None


def detect_profile(lines: list[dict[str, Any]]) -> str:
    """nta_cbt_v1 when `Question ID :` or `Q.n` markers are present, else generic_numbered."""
    nta = re.compile(r"^\s*(Question\s*ID\s*[:\-]|Q\.\s*\d)", re.IGNORECASE)
    if any(nta.match(ln["text"]) for ln in lines):
        return nta_cbt_v1.SPEC.name
    return generic_numbered.SPEC.name
