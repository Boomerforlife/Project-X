import type { ChapterRef, ExamRef, SubjectRef, TopicRef } from '@projectx/contracts';
import type { ChapterRow, ExamRow, SubjectRow, Taxonomy, TopicRow } from '../repositories/types';

export class TaxIndex {
  readonly exams = new Map<string, ExamRow>();
  readonly subjects = new Map<string, SubjectRow>();
  readonly chapters = new Map<string, ChapterRow>();
  readonly topics = new Map<string, TopicRow>();
  readonly examBySlug = new Map<string, ExamRow>();
  readonly subjectBySlug = new Map<string, SubjectRow>();
  readonly chapterBySlug = new Map<string, ChapterRow>();
  readonly topicBySlug = new Map<string, TopicRow>();

  constructor(readonly raw: Taxonomy) {
    for (const e of raw.exams) (this.exams.set(e.id, e), this.examBySlug.set(e.slug, e));
    for (const s of raw.subjects) (this.subjects.set(s.id, s), this.subjectBySlug.set(s.slug, s));
    for (const c of raw.chapters) (this.chapters.set(c.id, c), this.chapterBySlug.set(c.slug, c));
    for (const t of raw.topics) (this.topics.set(t.id, t), this.topicBySlug.set(t.slug, t));
  }

  examRef(e: ExamRow): ExamRef {
    return { id: e.id, slug: e.slug, name: e.name, short_name: e.short_name };
  }
  subjectRef(s: SubjectRow): SubjectRef {
    return { id: s.id, slug: s.slug, segment: s.segment, name: s.name, code: s.code };
  }
  chapterRef(c: ChapterRow): ChapterRef {
    return { id: c.id, slug: c.slug, segment: c.segment, name: c.name, unit_number: c.unit_number };
  }
  topicRef(t: TopicRow): TopicRef {
    return { id: t.id, slug: t.slug, segment: t.segment, name: t.name };
  }

  examPath(e: ExamRow): string {
    return `/${e.slug}`;
  }
  subjectPath(s: SubjectRow): string {
    const e = this.exams.get(s.exam_id);
    return `/${e?.slug ?? 'unknown'}/${s.segment}`;
  }
  chapterPath(c: ChapterRow): string {
    const s = this.subjects.get(c.subject_id);
    return s ? `${this.subjectPath(s)}/${c.segment}` : `/unknown/${c.segment}`;
  }
  topicPath(t: TopicRow): string {
    const c = this.chapters.get(t.chapter_id);
    return c ? `${this.chapterPath(c)}/${t.segment}` : `/unknown/${t.segment}`;
  }
}

export const questionPath = (slug: string): string => `/questions/${slug}`;
