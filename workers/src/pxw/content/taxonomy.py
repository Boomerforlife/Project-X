"""Exam / subject / chapter / topic taxonomy: from the database, or parsed from supabase/seed/*.sql when offline.

The seed parser is deliberately small and tolerant: it reads the VALUES tuples of the four taxonomy inserts and
re-derives slugs the way the seed does (`slug = parent.slug || '-' || app_private.slugify(name)`).
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pxw.config import ConfigError
from pxw.content.schema import Issue


@dataclass(frozen=True)
class ExamT:
    code: str
    slug: str
    active: bool = True
    id: str | None = None


@dataclass(frozen=True)
class SubjectT:
    exam_slug: str
    code: str
    segment: str
    slug: str
    id: str | None = None


@dataclass(frozen=True)
class ChapterT:
    subject_slug: str
    segment: str
    slug: str
    name: str = ""
    id: str | None = None


@dataclass(frozen=True)
class TopicT:
    chapter_slug: str
    segment: str
    slug: str
    name: str = ""
    id: str | None = None


@dataclass
class Resolution:
    exam_id: str | None = None
    subject_id: str | None = None
    chapter_id: str | None = None
    topic_id: str | None = None
    exam_slug: str | None = None
    subject_slug: str | None = None
    chapter_slug: str | None = None
    topic_slug: str | None = None
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)


@dataclass
class Taxonomy:
    exams: list[ExamT]
    subjects: list[SubjectT]
    chapters: list[ChapterT]
    topics: list[TopicT]
    origin: str = "seed"  # 'seed' | 'db'

    def resolve(self, exam: str, subject: str, chapter: str, topic: str | None = None) -> Resolution:
        res = Resolution()
        e_key = exam.strip().lower()
        ex = next((e for e in self.exams if e.slug == e_key or e.code.lower() == e_key), None)
        if ex is None:
            res.errors.append(Issue("UNKNOWN_EXAM", f"exam '{exam}' is not in the taxonomy", "exam"))
            return res
        res.exam_id, res.exam_slug = ex.id, ex.slug
        if not ex.active:
            res.warnings.append(Issue("EXAM_INACTIVE", f"exam '{ex.slug}' is not active yet", "exam"))

        s_key = subject.strip().lower()

        def s_match(s: SubjectT) -> bool:
            return s_key in (s.code.lower(), s.segment, s.slug)

        sub = next((s for s in self.subjects if s.exam_slug == ex.slug and s_match(s)), None)
        if sub is None:
            if any(s.slug == s_key and s.exam_slug != ex.slug for s in self.subjects):
                res.errors.append(Issue("TAXONOMY_MISMATCH", f"subject '{subject}' does not belong to exam '{ex.slug}'", "subject"))
            else:
                res.errors.append(Issue("UNKNOWN_SUBJECT", f"exam '{ex.slug}' has no subject '{subject}'", "subject"))
            return res
        res.subject_id, res.subject_slug = sub.id, sub.slug

        c_key = chapter.strip().lower()

        def c_match(c: ChapterT) -> bool:
            return c_key in (c.slug, c.segment)

        chap = next((c for c in self.chapters if c.subject_slug == sub.slug and c_match(c)), None)
        if chap is None:
            if any(c.slug == c_key for c in self.chapters):
                res.errors.append(
                    Issue("TAXONOMY_MISMATCH", f"chapter '{chapter}' does not belong to subject '{sub.slug}'", "chapter")
                )
            else:
                res.errors.append(Issue("UNKNOWN_CHAPTER", f"subject '{sub.slug}' has no chapter '{chapter}'", "chapter"))
            return res
        res.chapter_id, res.chapter_slug = chap.id, chap.slug

        if topic:
            t_key = topic.strip().lower()
            top = next((t for t in self.topics if t.chapter_slug == chap.slug and t_key in (t.slug, t.segment)), None)
            if top is None:
                if any(t.slug == t_key for t in self.topics):
                    res.errors.append(
                        Issue("TAXONOMY_MISMATCH", f"topic '{topic}' does not belong to chapter '{chap.slug}'", "topic")
                    )
                else:
                    res.errors.append(Issue("UNKNOWN_TOPIC", f"chapter '{chap.slug}' has no topic '{topic}'", "topic"))
                return res
            res.topic_id, res.topic_slug = top.id, top.slug
        return res


# --- slug helpers (mirror app_private.strip_latex / app_private.slugify in 0001) --------------------


def slugify(text: str) -> str:
    t = re.sub(r"\\[a-zA-Z]+|[${}^_]", " ", text or "")
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
    return t[:80].strip("-")


# --- seed parser ----------------------------------------------------------------------------------

_INSERT = re.compile(r"insert\s+into\s+(exams|subjects|chapters|topics)\b", re.IGNORECASE)
_ROW = re.compile(r"^\s*\((.*)\)\s*,?\s*$")
_TOKEN = re.compile(r"'((?:[^']|'')*)'|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b", re.IGNORECASE)


def _tuples(section: str) -> list[list[Any]]:
    rows: list[list[Any]] = []
    for line in section.splitlines():
        m = _ROW.match(line)
        if not m:
            continue
        vals: list[Any] = []
        for t in _TOKEN.finditer(m.group(1)):
            if t.group(1) is not None:
                vals.append(t.group(1).replace("''", "'"))
            elif t.group(2) is not None:
                vals.append(t.group(2))
            else:
                vals.append({"true": True, "false": False, "null": None}[t.group(3).lower()])
        if vals:
            rows.append(vals)
    return rows


def default_seed_dir() -> Path:
    env = os.environ.get("PXW_SEED_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[4] / "supabase" / "seed"


def parse_seed_taxonomy(seed_dir: str | Path | None = None) -> Taxonomy:
    d = Path(seed_dir) if seed_dir else default_seed_dir()
    files = sorted(d.glob("*.sql")) if d.is_dir() else []
    if not files:
        raise ConfigError(f"seed taxonomy not found at {d}; run with --db or set PXW_SEED_DIR")
    exams: list[ExamT] = []
    subjects: list[SubjectT] = []
    chapters: list[ChapterT] = []
    topics: list[TopicT] = []
    for f in files:
        text = f.read_text(encoding="utf-8")
        marks = list(_INSERT.finditer(text))
        for i, m in enumerate(marks):
            end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
            table = m.group(1).lower()
            for v in _tuples(text[m.end() : end]):
                if table == "exams" and len(v) >= 6:
                    exams.append(ExamT(code=str(v[0]), slug=str(v[1]), active=bool(v[5])))
                elif table == "subjects" and len(v) >= 3:
                    subjects.append(SubjectT(str(v[0]), str(v[1]), str(v[2]), f"{v[0]}-{v[2]}"))
                elif table == "chapters" and len(v) >= 3:
                    seg = slugify(str(v[2]))
                    chapters.append(ChapterT(str(v[0]), seg, f"{v[0]}-{seg}", str(v[2])))
                elif table == "topics" and len(v) >= 3:
                    seg = slugify(str(v[2]))
                    topics.append(TopicT(str(v[0]), seg, f"{v[0]}-{seg}", str(v[2])))
    return Taxonomy(exams, subjects, chapters, topics, origin="seed")


def load_db_taxonomy(conn: Any) -> Taxonomy:
    """Taxonomy with real ids. `conn` is a psycopg connection using dict rows (pxw.db.pg.get_connection)."""
    with conn.cursor() as cur:
        cur.execute("select id, code, slug, is_active from exams")
        exams = [ExamT(r["code"], r["slug"], r["is_active"], str(r["id"])) for r in cur.fetchall()]
        cur.execute("select s.id, s.code, s.segment, s.slug, e.slug as exam_slug from subjects s join exams e on e.id = s.exam_id")
        subjects = [SubjectT(r["exam_slug"], r["code"], r["segment"], r["slug"], str(r["id"])) for r in cur.fetchall()]
        cur.execute("select c.id, c.segment, c.slug, c.name, s.slug as subject_slug from chapters c join subjects s on s.id = c.subject_id")
        chapters = [ChapterT(r["subject_slug"], r["segment"], r["slug"], r["name"], str(r["id"])) for r in cur.fetchall()]
        cur.execute("select t.id, t.segment, t.slug, t.name, c.slug as chapter_slug from topics t join chapters c on c.id = t.chapter_id")
        topics = [TopicT(r["chapter_slug"], r["segment"], r["slug"], r["name"], str(r["id"])) for r in cur.fetchall()]
    return Taxonomy(exams, subjects, chapters, topics, origin="db")
