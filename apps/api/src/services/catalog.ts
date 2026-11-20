import type {
  Meta,
  PaperSummary,
  PublicChapter,
  PublicExam,
  PublicQuestion,
  PublicSubject,
  QuestionSummary,
  SearchResult,
  SitemapEntry,
  Seo,
} from '@projectx/contracts';
import { cacheTags } from '@projectx/edge';
import type { AppDeps } from '../deps';
import { ApiError, notFound } from '../lib/errors';
import { iso, paginate } from '../lib/http';
import { TaxIndex, questionPath } from '../mappers/taxonomy';
import {
  AssetResolver,
  bundleAssetIds,
  excerpt,
  toPublicQuestion,
  toQuestionSummary,
} from '../mappers/question';
import type { PageCursor, QuestionRow, Store, Taxonomy } from '../repositories/types';

export interface Out<T> {
  data: T;
  meta?: Meta;
  tags: string[];
}

/** Exam duration of a full paper, in minutes (NTA: JEE Main 3 h, NEET 3 h 20 min; JEE Advanced 3 h per paper). */
const PAPER_MINUTES: Record<string, number> = { 'jee-main': 180, 'jee-advanced': 180, neet: 200, 'neet-ug': 200 };

/** Complete previous-year papers of an exam, newest first (only papers whose every keyed question is published). */
export async function listPapers(store: Store, examSlug: string): Promise<Out<PaperSummary[]>> {
  return store.service(async (r) => {
    const tax = new TaxIndex(await r.taxonomy.load());
    const exam = tax.examBySlug.get(examSlug);
    if (!exam || !exam.is_active) throw notFound('Exam');
    const papers = await r.content.completePapers(exam.id);
    const data: PaperSummary[] = papers.map((p) => ({
      slug: p.slug,
      title: p.title,
      year: p.year,
      exam_date: p.exam_date,
      shift: p.shift,
      exam: tax.examRef(exam),
      question_count: p.question_count,
      duration_min: PAPER_MINUTES[exam.slug] ?? 180,
      sections: p.sections
        .flatMap((s) => {
          const sub = tax.subjects.get(s.subject_id);
          return sub ? [{ subject: tax.subjectRef(sub), question_count: s.n, order: sub.sort_order }] : [];
        })
        .sort((a, b) => a.order - b.order)
        .map(({ subject, question_count }) => ({ subject, question_count })),
    }));
    return { data, tags: [cacheTags.qlist, cacheTags.exam(exam.id)] };
  });
}

export function countsIndex(rows: { chapter_id: string; topic_id: string | null; n: number }[], tax: TaxIndex) {
  const byChapter = new Map<string, number>();
  const byTopic = new Map<string, number>();
  const bySubject = new Map<string, number>();
  const byExam = new Map<string, number>();
  for (const r of rows) {
    byChapter.set(r.chapter_id, (byChapter.get(r.chapter_id) ?? 0) + r.n);
    if (r.topic_id) byTopic.set(r.topic_id, (byTopic.get(r.topic_id) ?? 0) + r.n);
    const ch = tax.chapters.get(r.chapter_id);
    const sub = ch ? tax.subjects.get(ch.subject_id) : undefined;
    if (sub) {
      bySubject.set(sub.id, (bySubject.get(sub.id) ?? 0) + r.n);
      byExam.set(sub.exam_id, (byExam.get(sub.exam_id) ?? 0) + r.n);
    }
  }
  return { byChapter, byTopic, bySubject, byExam };
}

const active = <T extends { is_active: boolean; sort_order: number }>(xs: T[]): T[] =>
  xs.filter((x) => x.is_active).sort((a, b) => a.sort_order - b.sort_order);

async function loadTax(store: Store): Promise<{ tax: TaxIndex; raw: Taxonomy; counts: ReturnType<typeof countsIndex> }> {
  return store.service(async (r) => {
    const raw = await r.taxonomy.load();
    const tax = new TaxIndex(raw);
    return { tax, raw, counts: countsIndex(await r.taxonomy.publishedCounts(), tax) };
  });
}

// ------------------------------------------------------------------ taxonomy
export async function listExams(store: Store) {
  const { tax } = await loadTax(store);
  return {
    data: active(tax.raw.exams).map((e) => ({ ...tax.examRef(e), is_active: e.is_active, sort_order: e.sort_order })),
    tags: [cacheTags.taxonomy],
  };
}

export async function listSubjects(store: Store, examSlug: string) {
  const { tax } = await loadTax(store);
  const exam = tax.examBySlug.get(examSlug);
  if (!exam || !exam.is_active) throw notFound('Exam');
  const subjects = active(tax.raw.subjects.filter((s) => s.exam_id === exam.id));
  return {
    data: subjects.map((s) => ({
      ...tax.subjectRef(s),
      chapter_count: tax.raw.chapters.filter((c) => c.subject_id === s.id && c.is_active).length,
    })),
    tags: [cacheTags.taxonomy, cacheTags.exam(exam.id)],
  };
}

export async function listChapters(store: Store, subjectSlug: string) {
  const { tax, counts } = await loadTax(store);
  const subject = tax.subjectBySlug.get(subjectSlug);
  const exam = subject ? tax.exams.get(subject.exam_id) : undefined;
  if (!subject || !subject.is_active || !exam?.is_active) throw notFound('Subject');
  const chapters = active(tax.raw.chapters.filter((c) => c.subject_id === subject.id));
  return {
    data: chapters.map((c) => ({
      ...tax.chapterRef(c),
      topic_count: tax.raw.topics.filter((t) => t.chapter_id === c.id && t.is_active).length,
      published_question_count: counts.byChapter.get(c.id) ?? 0,
    })),
    tags: [cacheTags.taxonomy, cacheTags.exam(exam.id)],
  };
}

export async function listTopics(store: Store, chapterSlug: string) {
  const { tax, counts } = await loadTax(store);
  const chapter = tax.chapterBySlug.get(chapterSlug);
  const subject = chapter ? tax.subjects.get(chapter.subject_id) : undefined;
  const exam = subject ? tax.exams.get(subject.exam_id) : undefined;
  if (!chapter || !chapter.is_active || !subject?.is_active || !exam?.is_active) throw notFound('Chapter');
  return {
    data: active(tax.raw.topics.filter((t) => t.chapter_id === chapter.id)).map((t) => ({
      ...tax.topicRef(t),
      published_question_count: counts.byTopic.get(t.id) ?? 0,
    })),
    tags: [cacheTags.taxonomy, cacheTags.exam(exam.id)],
  };
}

export async function taxonomyTree(store: Store, examSlug: string) {
  const { tax } = await loadTax(store);
  const exam = tax.examBySlug.get(examSlug);
  if (!exam || !exam.is_active) throw notFound('Exam');
  const subjects = active(tax.raw.subjects.filter((s) => s.exam_id === exam.id)).map((s) => ({
    ...tax.subjectRef(s),
    chapters: active(tax.raw.chapters.filter((c) => c.subject_id === s.id)).map((c) => ({
      ...tax.chapterRef(c),
      topics: active(tax.raw.topics.filter((t) => t.chapter_id === c.id)).map((t) => tax.topicRef(t)),
    })),
  }));
  return { data: { exam: tax.examRef(exam), subjects }, tags: [cacheTags.taxonomy, cacheTags.exam(exam.id)] };
}

// ------------------------------------------------------------------ public pages
function pageSeo(title: string, description: string, path: string, robots: Seo['robots'] = 'index,follow'): Seo {
  return { title, description, robots, canonical_path: path };
}

export async function publicExam(store: Store, slug: string): Promise<Out<PublicExam>> {
  const { tax, counts } = await loadTax(store);
  const exam = tax.examBySlug.get(slug);
  if (!exam || !exam.is_active) throw new ApiError('NOT_FOUND', 'Exam not found', { cache: { cls: 'PUBLIC_NOT_FOUND', tags: [cacheTags.taxonomy] } });
  const subjects = active(tax.raw.subjects.filter((s) => s.exam_id === exam.id));
  return {
    data: {
      exam: tax.examRef(exam),
      subjects: subjects.map((s) => ({ ...tax.subjectRef(s), published_question_count: counts.bySubject.get(s.id) ?? 0 })),
      seo: pageSeo(`${exam.name} Practice Questions`, `Practice ${exam.name} questions with verified solutions.`, tax.examPath(exam)),
      breadcrumbs: [{ name: exam.short_name, path: tax.examPath(exam) }],
    },
    tags: [cacheTags.exam(exam.id), cacheTags.taxonomy],
  };
}

export async function publicSubject(store: Store, slug: string): Promise<Out<PublicSubject>> {
  const { tax, counts } = await loadTax(store);
  const subject = tax.subjectBySlug.get(slug);
  const exam = subject ? tax.exams.get(subject.exam_id) : undefined;
  if (!subject || !subject.is_active || !exam?.is_active) throw new ApiError('NOT_FOUND', 'Subject not found', { cache: { cls: 'PUBLIC_NOT_FOUND', tags: [cacheTags.taxonomy] } });
  const chapters = active(tax.raw.chapters.filter((c) => c.subject_id === subject.id));
  return {
    data: {
      subject: tax.subjectRef(subject),
      exam: tax.examRef(exam),
      chapters: chapters.map((c) => ({ ...tax.chapterRef(c), published_question_count: counts.byChapter.get(c.id) ?? 0 })),
      seo: pageSeo(`${exam.short_name} ${subject.name} Questions`, `${exam.name} ${subject.name} practice questions by chapter.`, tax.subjectPath(subject)),
      breadcrumbs: [
        { name: exam.short_name, path: tax.examPath(exam) },
        { name: subject.name, path: tax.subjectPath(subject) },
      ],
    },
    tags: [cacheTags.subject(subject.id), cacheTags.exam(exam.id)],
  };
}

export async function publicChapter(
  store: Store,
  slug: string,
  q: { difficulty?: NonNullable<QuestionRow['difficulty']> | undefined; type?: QuestionRow['question_type'] | undefined; topic?: string | undefined; year?: number | undefined; cursor: PageCursor | null; limit: number },
): Promise<Out<PublicChapter>> {
  return store.service(async (r) => {
    const raw = await r.taxonomy.load();
    const tax = new TaxIndex(raw);
    const chapter = tax.chapterBySlug.get(slug);
    const subject = chapter ? tax.subjects.get(chapter.subject_id) : undefined;
    const exam = subject ? tax.exams.get(subject.exam_id) : undefined;
    if (!chapter || !chapter.is_active || !subject?.is_active || !exam?.is_active) {
      throw new ApiError('NOT_FOUND', 'Chapter not found', { cache: { cls: 'PUBLIC_NOT_FOUND', tags: [cacheTags.chapterSlug(slug)] } });
    }
    let topicId: string | undefined;
    if (q.topic) {
      const t = tax.topicBySlug.get(q.topic);
      if (!t || t.chapter_id !== chapter.id) throw notFound('Topic');
      topicId = t.id;
    }
    const counts = countsIndex(await r.taxonomy.publishedCounts(), tax);
    const rows = await r.content.listForChapter({
      chapterId: chapter.id,
      topicId,
      difficulty: q.difficulty,
      type: q.type,
      year: q.year,
      after: q.cursor,
      limit: q.limit + 1,
    });
    const page = paginate(rows, q.limit);
    const questions = page.rows.map((row) => toQuestionSummary(row, tax)).filter((x): x is QuestionSummary => x !== null);
    return {
      data: {
        chapter: { ...tax.chapterRef(chapter), description: chapter.description },
        subject: tax.subjectRef(subject),
        exam: tax.examRef(exam),
        topics: active(raw.topics.filter((t) => t.chapter_id === chapter.id)).map((t) => ({
          ...tax.topicRef(t),
          published_question_count: counts.byTopic.get(t.id) ?? 0,
        })),
        questions,
        seo: pageSeo(
          `${chapter.name} - ${exam.short_name} ${subject.name} Questions`,
          chapter.description ?? `${exam.short_name} ${subject.name}: ${chapter.name} practice questions with solutions.`,
          tax.chapterPath(chapter),
        ),
        breadcrumbs: [
          { name: exam.short_name, path: tax.examPath(exam) },
          { name: subject.name, path: tax.subjectPath(subject) },
          { name: chapter.name, path: tax.chapterPath(chapter) },
        ],
      },
      meta: page.meta,
      tags: [cacheTags.chapter(chapter.id), cacheTags.chapterSlug(slug), cacheTags.subject(subject.id), cacheTags.exam(exam.id), cacheTags.qlist],
    };
  });
}

// ------------------------------------------------------------------ question
export async function publicQuestion(
  store: Store,
  deps: Pick<AppDeps, 'config' | 'logger'>,
  slug: string,
): Promise<Out<PublicQuestion> & { etag: string }> {
  return store.service(async (r) => {
    const bundle = await r.content.getPublishedBySlug(slug);
    const notFoundCache = { cls: 'PUBLIC_NOT_FOUND' as const, tags: [cacheTags.questionSlug(slug)] };
    if (!bundle) {
      const target = await r.content.findRedirectTarget(slug);
      if (target) {
        throw new ApiError('MOVED_PERMANENTLY', 'Question moved', {
          details: { slug: target, canonical_path: questionPath(target) },
          headers: { Location: `/api/v1/public/questions/${target}` },
          cache: notFoundCache,
        });
      }
      throw new ApiError('NOT_FOUND', 'Question not found', { cache: notFoundCache });
    }
    const tax = new TaxIndex(await r.taxonomy.load());
    const assets = new AssetResolver(await r.content.assetsByIds(bundleAssetIds(bundle)), deps.config.PUBLIC_ASSETS_BASE_URL, deps.logger);
    const related = await r.content.countRelated(bundle.question);
    const dto = toPublicQuestion(bundle, tax, assets, related, deps.logger);
    if (!dto) throw new ApiError('NOT_FOUND', 'Question not found', { cache: notFoundCache });
    const q = bundle.question;
    const tags = [
      cacheTags.question(q.id),
      cacheTags.questionSlug(q.slug),
      ...(q.chapter_id ? [cacheTags.chapter(q.chapter_id)] : []),
      ...(q.subject_id ? [cacheTags.subject(q.subject_id)] : []),
      cacheTags.exam(q.exam_id),
    ];
    return { data: dto, tags, etag: `W/"${q.id}:${q.row_version}"` };
  });
}

export async function relatedQuestions(store: Store, slug: string, limit: number): Promise<Out<QuestionSummary[]>> {
  return store.service(async (r) => {
    const bundle = await r.content.getPublishedBySlug(slug);
    if (!bundle) {
      throw new ApiError('NOT_FOUND', 'Question not found', { cache: { cls: 'PUBLIC_NOT_FOUND', tags: [cacheTags.questionSlug(slug)] } });
    }
    const tax = new TaxIndex(await r.taxonomy.load());
    const rows = await r.content.listRelated(bundle.question, limit);
    const q = bundle.question;
    return {
      data: rows.map((x) => toQuestionSummary(x, tax)).filter((x): x is QuestionSummary => x !== null),
      tags: [cacheTags.question(q.id), cacheTags.questionSlug(q.slug), ...(q.chapter_id ? [cacheTags.chapter(q.chapter_id)] : []), cacheTags.qlist],
    };
  });
}

export async function searchQuestions(
  store: Store,
  f: { q: string; exam?: string | undefined; subject?: string | undefined; chapter?: string | undefined; cursor: PageCursor | null; limit: number },
): Promise<Out<SearchResult[]>> {
  return store.service(async (r) => {
    const tax = new TaxIndex(await r.taxonomy.load());
    const examId = f.exam ? (tax.examBySlug.get(f.exam)?.id ?? 'none') : undefined;
    const subjectId = f.subject ? (tax.subjectBySlug.get(f.subject)?.id ?? 'none') : undefined;
    const chapterId = f.chapter ? (tax.chapterBySlug.get(f.chapter)?.id ?? 'none') : undefined;
    const rows = await r.content.search({ q: f.q, examId, subjectId, chapterId, after: f.cursor, limit: f.limit + 1 });
    const page = paginate(rows, f.limit);
    const data: SearchResult[] = [];
    for (const row of page.rows) {
      const s = toQuestionSummary(row, tax);
      if (s) data.push({ ...s, rank: row.rank });
    }
    return { data, meta: page.meta, tags: [cacheTags.search, cacheTags.qlist] };
  });
}

export async function sitemapQuestions(store: Store, cursor: PageCursor | null, limit: number): Promise<Out<SitemapEntry[]>> {
  return store.service(async (r) => {
    const rows = await r.content.sitemap(cursor, limit + 1);
    const page = paginate(rows, limit);
    const tax = new TaxIndex(await r.taxonomy.load());
    const data: SitemapEntry[] = [];
    for (const x of page.rows) {
      const exam = tax.exams.get(x.exam_id);
      if (!exam) continue;
      data.push({ canonical_path: questionPath(x.slug), slug: x.slug, exam_slug: exam.slug, updated_at: iso(x.updated_at) });
    }
    return {
      data,
      meta: page.meta,
      tags: [cacheTags.sitemap],
    };
  });
}

export { excerpt };
