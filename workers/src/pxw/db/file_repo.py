"""FileIngestionRepo: JSON state under PXW_WORK_DIR/db/state.json (offline tests / dev). Single-process."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz

from pxw.common.errors import SourceNotApproved
from pxw.common.jsonio import atomic_write_json
from pxw.common.models import (
    AssetIn,
    OfficialKeyIn,
    PaperIn,
    Source,
    SourceDocumentIn,
    SourceDocumentRec,
    SourceQuestionIn,
    SourceQuestionRec,
)

_NS = uuid.UUID("6f1b6a64-3c0e-4f7e-9d0b-0a5c3b1d2e11")

# Mirrors seed 0005 semantics: official bodies start NOT approved; the editorial source is approved.
_DEFAULT_SOURCES = {
    "NTA": {
        "name": "National Testing Agency",
        "kind": "OFFICIAL_EXAM_BODY",
        "reuse_permitted": False,
        "approved_at": None,
    },
    "PROJECTX_EDITORIAL": {
        "name": "ProjectX Editorial",
        "kind": "EDITORIAL_TEAM",
        "reuse_permitted": True,
        "approved_at": "2026-01-01T00:00:00+00:00",
    },
}


def exam_uuid(slug: str) -> str:
    return str(uuid.uuid5(_NS, f"exam:{slug}"))


class FileIngestionRepo:
    def __init__(self, root: str | Path) -> None:
        p = Path(root)
        self.path = p / "state.json" if p.suffix == "" else p
        self.path.parent.mkdir(parents=True, exist_ok=True)

    # -- state ----------------------------------------------------------------------------------

    def _load(self) -> dict[str, Any]:
        if self.path.exists():
            st = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            st = {}
        for k in ("papers", "documents", "source_questions", "assets", "keys", "questions"):
            st.setdefault(k, {})
        if "sources" not in st:
            st["sources"] = {
                code: {"id": str(uuid.uuid5(_NS, f"source:{code}")), "code": code, **v}
                for code, v in _DEFAULT_SOURCES.items()
            }
        return st

    def _save(self, st: dict[str, Any]) -> None:
        atomic_write_json(self.path, st, indent=None)

    def set_source(self, code: str, *, reuse_permitted: bool, approved_at: str | None, **extra: Any) -> None:
        """Test/dev helper: create or update a source."""
        st = self._load()
        cur = st["sources"].get(code, {"id": str(uuid.uuid5(_NS, f"source:{code}")), "code": code, "name": code})
        cur.update({"reuse_permitted": reuse_permitted, "approved_at": approved_at, "kind": "EDITORIAL_TEAM", **extra})
        st["sources"][code] = cur
        self._save(st)

    def counts(self) -> dict[str, int]:
        st = self._load()
        return {k: len(st[k]) for k in ("papers", "documents", "source_questions", "assets", "keys", "questions")}

    # -- IngestionRepo --------------------------------------------------------------------------

    def get_source(self, code: str) -> Source:
        st = self._load()
        s = st["sources"].get(code)
        if s is None:
            raise SourceNotApproved(f"unknown source {code!r}")
        if not (s.get("reuse_permitted") and s.get("approved_at")):
            raise SourceNotApproved(f"source {code!r} is not approved for reuse")
        return Source(**s)

    def resolve_exam_id(self, exam_slug: str) -> str:
        return exam_uuid(exam_slug)

    def upsert_paper(self, paper: PaperIn) -> str:
        st = self._load()
        for pid, p in st["papers"].items():
            if p["slug"] == paper.slug:
                p.update(paper.model_dump())
                self._save(st)
                return pid
        pid = str(uuid.uuid4())
        st["papers"][pid] = {"id": pid, **paper.model_dump()}
        self._save(st)
        return pid

    def register_document(self, doc: SourceDocumentIn) -> tuple[str, bool]:
        st = self._load()
        for did, d in st["documents"].items():
            if d["sha256"] == doc.sha256:
                if doc.paper_id and not d.get("paper_id"):
                    d["paper_id"] = doc.paper_id
                    self._save(st)
                return did, False
        did = str(uuid.uuid4())
        st["documents"][did] = {"id": did, "bucket": "SOURCE_DOCS", **doc.model_dump()}
        self._save(st)
        return did, True

    def get_document(self, document_id: str) -> SourceDocumentRec:
        d = self._load()["documents"].get(document_id)
        if d is None:
            raise KeyError(f"source document {document_id} not found")
        return SourceDocumentRec(**d)

    def set_page_count(self, document_id: str, page_count: int) -> None:
        st = self._load()
        st["documents"][document_id]["page_count"] = page_count
        self._save(st)

    def upsert_source_question(self, sq: SourceQuestionIn) -> str:
        st = self._load()
        for sid, r in st["source_questions"].items():
            if r["source_document_id"] == sq.source_document_id and r["question_number"] == sq.question_number:
                if r["status"] == "PROMOTED":
                    return sid
                r.update(sq.model_dump())
                r["id"] = sid
                self._save(st)
                return sid
        sid = str(uuid.uuid4())
        st["source_questions"][sid] = {"id": sid, "promoted_question_id": None, **sq.model_dump()}
        self._save(st)
        return sid

    def insert_asset(self, a: AssetIn) -> str:
        st = self._load()
        for aid, r in st["assets"].items():
            if r["bucket"] == a.bucket and r["r2_key"] == a.r2_key:
                r.update(a.model_dump())
                self._save(st)
                return aid
        aid = str(uuid.uuid4())
        st["assets"][aid] = {"id": aid, "question_id": None, **a.model_dump()}
        self._save(st)
        return aid

    def _own_question_ids(self, st: dict[str, Any], document_id: str | None) -> set[str]:
        if not document_id:
            return set()
        return {
            r["promoted_question_id"]
            for r in st["source_questions"].values()
            if r["source_document_id"] == document_id and r.get("promoted_question_id")
        }

    def exact_duplicates(self, content_hash: str, *, exclude_source_document_id: str | None = None) -> list[str]:
        st = self._load()
        own = self._own_question_ids(st, exclude_source_document_id)
        found = [qid for qid, q in st["questions"].items() if q["content_hash"] == content_hash and qid not in own]
        for r in st["source_questions"].values():
            pq = r.get("promoted_question_id")
            if (
                pq
                and r["content_hash"] == content_hash
                and pq not in own
                and pq not in found
                and r["source_document_id"] != exclude_source_document_id
            ):
                found.append(pq)
        return found

    def near_duplicates(
        self, normalized_text: str, threshold: float, *, exclude_source_document_id: str | None = None
    ) -> list[tuple[str, float]]:
        st = self._load()
        own = self._own_question_ids(st, exclude_source_document_id)
        out = []
        for qid, q in st["questions"].items():
            if qid in own:
                continue
            sim = fuzz.ratio(normalized_text, q["normalized_text"]) / 100.0
            if sim >= threshold:
                out.append((qid, sim))
        out.sort(key=lambda t: -t[1])
        return out[:5]

    def upsert_official_keys(self, rows: list[OfficialKeyIn]) -> int:
        st = self._load()
        n = 0
        for row in rows:
            key = f"{row.paper_id}|{row.question_number}|{row.external_question_id}"
            prev = st["keys"].get(key)
            st["keys"][key] = {**row.model_dump(), "question_id": prev["question_id"] if prev else None}
            n += 1
        self._save(st)
        return n

    def paper_question_map(self, paper_slug: str) -> tuple[str, dict[str, list[str]]] | None:
        return None  # official keys by external id need the Postgres repo

    def document_question_map(self, document_id: str) -> tuple[str, dict[str, list[str]]] | None:
        return None  # official keys by external id need the Postgres repo

    def list_source_questions(self, document_id: str, status: str | None = None) -> list[SourceQuestionRec]:
        st = self._load()
        out = []
        for sid, r in st["source_questions"].items():
            if r["source_document_id"] != document_id or (status and r["status"] != status):
                continue
            out.append(
                SourceQuestionRec(
                    id=sid,
                    source_document_id=document_id,
                    question_number=r["question_number"],
                    status=r["status"],
                    warnings=r.get("warnings", []),
                    possible_duplicate_of=r.get("possible_duplicate_of"),
                    duplicate_of_question_id=r.get("duplicate_of_question_id"),
                    promoted_question_id=r.get("promoted_question_id"),
                    section_hint=r["normalized"].get("section_hint"),
                )
            )
        return out

    def promote(self, source_question_id: str, exam_id: str, subject_code: str | None) -> str:
        st = self._load()
        r = st["source_questions"][source_question_id]
        if r["status"] == "PROMOTED":
            return r["promoted_question_id"]
        if r["status"] != "NORMALIZED" or r.get("duplicate_of_question_id"):
            raise ValueError(f"source_question {source_question_id} is not promotable (status={r['status']})")
        doc = st["documents"][r["source_document_id"]]
        qid = str(uuid.uuid4())
        st["questions"][qid] = {
            "id": qid,
            "exam_id": exam_id,
            "paper_id": doc.get("paper_id"),
            "question_number": r["question_number"],
            "source_question_id": source_question_id,
            "content_hash": r["content_hash"],
            "normalized_text": r["normalized_text"],
            "subject_code": subject_code or r["normalized"].get("section_hint"),
            "answer_key": None,
        }
        r["status"] = "PROMOTED"
        r["promoted_question_id"] = qid
        for a in st["assets"].values():
            if a["source_question_id"] == source_question_id:
                a["question_id"] = qid
        self._save(st)
        return qid

    def link_keys(self, paper_id: str) -> int:
        """Match keys to promoted questions of the paper by question_number (external ids unsupported offline)."""
        st = self._load()
        by_number: dict[str, str] = {}
        for q in st["questions"].values():
            if q.get("paper_id") == paper_id:
                by_number[q["question_number"]] = q["id"]
        n = 0
        for k in st["keys"].values():
            if k["paper_id"] == paper_id and k.get("question_number") in by_number:
                k["question_id"] = by_number[k["question_number"]]
                n += 1
        self._save(st)
        return n
