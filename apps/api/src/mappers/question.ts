import { z } from '@hono/zod-openapi';
import {
  SolutionStepSchema,
  type AnswerKey,
  type AnswerKeyWithLabels,
  type Attribution,
  type Breadcrumb,
  type ContentBlock,
  type OptionLabel,
  type PracticeQuestion,
  type PublicContentBlock,
  type PublicOption,
  type PublicQuestion,
  type PublicSolution,
  type PublicSolutionStep,
  type QuestionSummary,
  type Seo,
} from '@projectx/contracts';
import type { Logger } from '../deps';
import { iso, isoOrNull } from '../lib/http';
import type { AssetRow, OptionRow, PaperRow, QuestionBundle, QuestionRow, SolutionRow, SourceRow } from '../repositories/types';
import { questionPath, type TaxIndex } from './taxonomy';

// ---------------------------------------------------------------- assets
export function collectAssetIds(blocks: readonly ContentBlock[], into: Set<string> = new Set()): Set<string> {
  for (const b of blocks) if (b.type === 'image') into.add(b.asset_id);
  return into;
}

/** Resolves image asset ids to absolute public URLs. Only PUBLIC_ASSETS objects are ever exposed. */
export class AssetResolver {
  private readonly byId = new Map<string, AssetRow>();
  constructor(
    assets: readonly AssetRow[],
    private readonly baseUrl: string,
    private readonly logger?: Logger,
  ) {
    for (const a of assets) this.byId.set(a.id, a);
  }

  blocks(blocks: readonly ContentBlock[]): PublicContentBlock[] {
    const out: PublicContentBlock[] = [];
    for (const b of blocks) {
      if (b.type !== 'image') {
        out.push(b);
        continue;
      }
      const a = this.byId.get(b.asset_id);
      if (!a || a.bucket !== 'PUBLIC_ASSETS') {
        this.logger?.warn('image asset not public; block omitted', { asset_id: b.asset_id });
        continue;
      }
      out.push({
        type: 'image',
        asset_id: b.asset_id,
        alt: b.alt,
        ...(b.caption !== undefined ? { caption: b.caption } : {}),
        url: `${this.baseUrl.replace(/\/+$/, '')}/${a.r2_key}`,
        width: a.width,
        height: a.height,
      });
    }
    return out;
  }
}

export function parseSteps(raw: unknown[], logger?: Logger): z.output<typeof SolutionStepSchema>[] {
  const r = z.array(SolutionStepSchema).safeParse(raw);
  if (!r.success) {
    logger?.warn('invalid solution steps in DB; omitted');
    return [];
  }
  return r.data;
}

/** Asset ids referenced by a bundle (question, options, solution steps/alternatives). */
export function bundleAssetIds(b: QuestionBundle): string[] {
  const ids = collectAssetIds(b.question.structured_content);
  for (const o of b.options) collectAssetIds(o.content, ids);
  if (b.solution) {
    for (const s of parseSteps(b.solution.steps)) collectAssetIds(s.blocks, ids);
    const alts = Array.isArray(b.solution.alternatives) ? b.solution.alternatives : [];
    for (const a of alts) {
      const steps = (a as { steps?: unknown[] }).steps;
      if (Array.isArray(steps)) for (const s of parseSteps(steps)) collectAssetIds(s.blocks, ids);
    }
  }
  return [...ids];
}

// ---------------------------------------------------------------- text helpers
export function plainText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
export function excerpt(text: string, max = 200): string {
  const t = plainText(text);
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------- answers
export function labelsFor(key: AnswerKey, options: readonly OptionRow[]): OptionLabel[] | undefined {
  if (key.type === 'NUMERICAL') return undefined;
  const byId = new Map(options.map((o) => [o.id, o.label] as const));
  const labels = key.correct_option_ids.map((id) => byId.get(id)).filter((l): l is OptionLabel => l !== undefined);
  return labels.sort();
}
export function withLabels(key: AnswerKey, options: readonly OptionRow[]): AnswerKeyWithLabels {
  const labels = labelsFor(key, options);
  return (labels ? { ...key, correct_labels: labels } : { ...key }) as AnswerKeyWithLabels;
}

// ---------------------------------------------------------------- DTOs
export function toPublicOptions(options: readonly OptionRow[], r: AssetResolver): PublicOption[] {
  return [...options]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => ({ id: o.id, label: o.label, content: r.blocks(o.content) }));
}

export function toPublicSolution(s: SolutionRow, options: readonly OptionRow[], r: AssetResolver, logger?: Logger): PublicSolution {
  const toSteps = (raw: unknown[]): PublicSolutionStep[] =>
    parseSteps(raw, logger).map((st) => ({ index: st.index, title: st.title, blocks: r.blocks(st.blocks) }));
  const alts = (Array.isArray(s.alternatives) ? s.alternatives : []) as { title?: unknown; steps?: unknown }[];
  return {
    id: s.id,
    version: s.version,
    final_answer: withLabels(s.final_answer, options),
    summary: s.summary,
    steps: toSteps(s.steps),
    formulas: (s.formulas as { name: string; latex: string }[]).map((f) => ({ name: f.name, latex: f.latex })),
    concepts: s.concepts,
    alternatives: alts.map((a) => ({
      title: typeof a.title === 'string' ? a.title : '',
      steps: toSteps(Array.isArray(a.steps) ? a.steps : []),
    })),
    shortcuts: s.shortcuts,
    common_mistakes: s.common_mistakes,
    provenance: s.provenance,
    approved_at: s.review_status === 'APPROVED' ? isoOrNull(s.reviewed_at) : null,
  };
}

export function toAttribution(q: QuestionRow, paper: PaperRow | null, source: SourceRow | null): Attribution {
  return {
    origin: q.origin,
    source_name: source?.name ?? null,
    attribution_text: source?.attribution_text ?? null,
    license_name: source?.license_name ?? null,
    license_url: source?.license_url ?? null,
    paper: paper
      ? {
          slug: paper.slug,
          title: paper.title,
          year: paper.year,
          session_label: paper.session_label,
          exam_date: paper.exam_date,
          shift: paper.shift,
          paper_code: paper.paper_code,
        }
      : null,
  };
}

export function questionSeo(q: QuestionRow, tax: TaxIndex): Seo {
  const exam = tax.exams.get(q.exam_id);
  const subject = q.subject_id ? tax.subjects.get(q.subject_id) : undefined;
  const base = plainText(q.question_text).slice(0, 60).trimEnd();
  const suffix = [exam?.short_name, subject?.name].filter(Boolean).join(' ');
  return {
    title: q.seo_title ?? (suffix ? `${base} | ${suffix}` : base),
    description: q.seo_description ?? excerpt(q.question_text, 160),
    robots: q.is_indexable ? 'index,follow' : 'noindex,follow',
    canonical_path: questionPath(q.slug),
  };
}

export function toQuestionSummary(q: QuestionRow, tax: TaxIndex): QuestionSummary | null {
  const chapter = q.chapter_id ? tax.chapters.get(q.chapter_id) : undefined;
  if (!chapter) return null;
  const topic = q.topic_id ? tax.topics.get(q.topic_id) : undefined;
  return {
    id: q.id,
    slug: q.slug,
    canonical_path: questionPath(q.slug),
    excerpt: excerpt(q.question_text, 200),
    question_type: q.question_type,
    difficulty: q.difficulty,
    year: q.year,
    origin: q.origin,
    chapter: tax.chapterRef(chapter),
    topic: topic ? tax.topicRef(topic) : null,
    // Same rule as toPublicQuestion: only these statuses (with a current solution) get a public question page.
    public_page:
      (q.verification_status === 'OFFICIAL_KEY_MATCHED' || q.verification_status === 'HUMAN_VERIFIED') && q.current_solution_id !== null,
  };
}

function breadcrumbs(q: QuestionRow, tax: TaxIndex): Breadcrumb[] {
  const out: Breadcrumb[] = [];
  const exam = tax.exams.get(q.exam_id);
  if (exam) out.push({ name: exam.short_name, path: tax.examPath(exam) });
  const subject = q.subject_id ? tax.subjects.get(q.subject_id) : undefined;
  if (subject) out.push({ name: subject.name, path: tax.subjectPath(subject) });
  const chapter = q.chapter_id ? tax.chapters.get(q.chapter_id) : undefined;
  if (chapter) out.push({ name: chapter.name, path: tax.chapterPath(chapter) });
  out.push({ name: excerpt(q.question_text, 60), path: questionPath(q.slug) });
  return out;
}

/** Returns null when the question cannot be shown publicly (incomplete taxonomy / solution / verification). */
export function toPublicQuestion(
  b: QuestionBundle,
  tax: TaxIndex,
  assets: AssetResolver,
  relatedCount: number,
  logger?: Logger,
): PublicQuestion | null {
  const q = b.question;
  const exam = tax.exams.get(q.exam_id);
  const subject = q.subject_id ? tax.subjects.get(q.subject_id) : undefined;
  const chapter = q.chapter_id ? tax.chapters.get(q.chapter_id) : undefined;
  const status = q.verification_status;
  if (!exam || !subject || !chapter || !b.solution) return null;
  if (status !== 'OFFICIAL_KEY_MATCHED' && status !== 'HUMAN_VERIFIED') return null;
  const topic = q.topic_id ? tax.topics.get(q.topic_id) : undefined;
  const published = q.published_at ?? q.updated_at;
  return {
    id: q.id,
    slug: q.slug,
    canonical_path: questionPath(q.slug),
    exam: tax.examRef(exam),
    subject: tax.subjectRef(subject),
    chapter: tax.chapterRef(chapter),
    topic: topic ? tax.topicRef(topic) : null,
    question_type: q.question_type,
    difficulty: q.difficulty,
    marks: q.marks,
    negative_marks: q.negative_marks,
    content: assets.blocks(q.structured_content),
    options: toPublicOptions(b.options, assets),
    solution: toPublicSolution(b.solution, b.options, assets, logger),
    verification: {
      status,
      label: status === 'HUMAN_VERIFIED' ? 'Verified by a human reviewer' : 'Matches the official answer key',
    },
    attribution: toAttribution(q, b.paper, b.source),
    year: q.year,
    shift: q.shift,
    seo: questionSeo(q, tax),
    indexable: q.is_indexable,
    publication: {
      published_at: iso(published),
      updated_at: iso(q.updated_at),
      first_published_at: iso(q.first_published_at ?? published),
    },
    breadcrumbs: breadcrumbs(q, tax),
    related: { count: relatedCount, path: `/api/v1/public/questions/${q.slug}/related` },
  };
}

/**
 * Practice DTO: explicit allow-list. MUST NOT carry answer_key / correct ids / solution (contract test).
 * Option objects are rebuilt from scratch (id, label, content only).
 */
export function toPracticeQuestion(
  q: QuestionRow,
  options: readonly OptionRow[],
  tax: TaxIndex,
  assets: AssetResolver,
  paper: PaperRow | null,
): PracticeQuestion | null {
  const exam = tax.exams.get(q.exam_id);
  const subject = q.subject_id ? tax.subjects.get(q.subject_id) : undefined;
  const chapter = q.chapter_id ? tax.chapters.get(q.chapter_id) : undefined;
  if (!exam || !subject || !chapter) return null;
  const topic = q.topic_id ? tax.topics.get(q.topic_id) : undefined;
  return {
    id: q.id,
    slug: q.slug,
    question_type: q.question_type,
    difficulty: q.difficulty,
    marks: q.marks,
    negative_marks: q.negative_marks,
    content: assets.blocks(q.structured_content),
    options: toPublicOptions(options, assets),
    exam: tax.examRef(exam),
    subject: tax.subjectRef(subject),
    chapter: tax.chapterRef(chapter),
    topic: topic ? tax.topicRef(topic) : null,
    attribution: { origin: q.origin, year: q.year, paper_title: paper?.title ?? null },
  };
}
