import type {
  AdminQuestion,
  AdminQuestionListItem,
  AnswerKey,
  ApproveBody,
  ContentBlock,
  CreateSolutionBody,
  DisputeBody,
  PatchQuestionBody,
  PublishBody,
  RejectBody,
  SolutionVersionFull,
  TransitionBody,
  VerificationRunBody,
  VerificationStatus,
} from '@projectx/contracts';
import { cacheTags, copyObject, r2Keys } from '@projectx/edge';
import { answerKeysEqual, canonicalizeAnswerKey, canonicalJson, sha256Hex } from '@projectx/shared';
import type { AppDeps, AuthUser } from '../deps';
import { ApiError, invalidState, notFound, validation } from '../lib/errors';
import { iso, isoOrNull, paginate } from '../lib/http';
import { collectAssetIds, parseSteps, plainText } from '../mappers/question';
import { TaxIndex } from '../mappers/taxonomy';
import type {
  Keyed,
  OptionRow,
  PageCursor,
  QuestionPatch,
  QuestionRow,
  ReviewEventRow,
  ServiceRepos,
  SolutionRow,
  Store,
} from '../repositories/types';
import type { Out } from './catalog';

export interface AdminCtx {
  store: Store;
  deps: AppDeps;
  user: AuthUser;
  roles: readonly ('ADMIN' | 'REVIEWER')[];
  requestId: string;
  ipHash: string;
}
/** Must match RULES_VERSION in @projectx/ai (AI_PIPELINE section 4). */
const VERIFY_RULES_VERSION = 'v1';
const isAdmin = (c: AdminCtx): boolean => c.roles.includes('ADMIN');

// ------------------------------------------------------------------ helpers
export function blocksToText(blocks: readonly ContentBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'paragraph') parts.push(b.text);
    else if (b.type === 'math') parts.push(`$${b.latex}$`);
    else if (b.type === 'list') parts.push(b.items.join(' '));
    else if (b.type === 'table') parts.push([...(b.header ?? []), ...b.rows.flat()].join(' '));
    else if (b.type === 'image' && b.alt) parts.push(b.alt);
  }
  return plainText(parts.join(' ')) || 'question';
}

function purgeTagsFor(q: QuestionRow, extra: string[] = []): string[] {
  return [
    cacheTags.question(q.id),
    cacheTags.questionSlug(q.slug),
    ...(q.chapter_id ? [cacheTags.chapter(q.chapter_id)] : []),
    ...(q.subject_id ? [cacheTags.subject(q.subject_id)] : []),
    cacheTags.exam(q.exam_id),
    cacheTags.qlist,
    cacheTags.sitemap,
    cacheTags.search,
    ...extra,
  ];
}

function purge(c: AdminCtx, tags: string[]): void {
  const unique = [...new Set(tags)];
  c.deps.waitUntil(
    c.deps.cache
      .purgeTags(unique)
      .then((r) => {
        if (!r.ok) c.deps.logger.warn('cache purge failed', { request_id: c.requestId, error: r.error });
      })
      .catch((e: unknown) => c.deps.logger.error('cache purge threw', { request_id: c.requestId, error: String(e) })),
  );
}

async function audit(r: ServiceRepos, c: AdminCtx, action: string, entityType: string, entityId: string | null, details: unknown): Promise<void> {
  await r.admin.insertAudit({
    actor_id: c.user.id,
    actor_type: isAdmin(c) ? 'ADMIN' : 'USER',
    action,
    entity_type: entityType,
    entity_id: entityId,
    request_id: c.requestId,
    ip_hash: c.ipHash,
    details,
  });
}

async function event(
  r: ServiceRepos,
  c: AdminCtx,
  q: QuestionRow,
  after: QuestionRow,
  action: ReviewEventRow['action'],
  note: string | null,
  solutionVersionId: string | null = null,
): Promise<void> {
  await r.admin.insertReviewEvent({
    question_id: q.id,
    solution_version_id: solutionVersionId,
    actor_id: c.user.id,
    action,
    from_verification_status: q.verification_status,
    to_verification_status: after.verification_status,
    from_publication_status: q.publication_status,
    to_publication_status: after.publication_status,
    note,
  });
}

const refs = (q: QuestionRow, tax: TaxIndex) => {
  const exam = tax.exams.get(q.exam_id);
  if (!exam) throw new ApiError('INTERNAL', 'question has unknown exam');
  const subject = q.subject_id ? tax.subjects.get(q.subject_id) : undefined;
  const chapter = q.chapter_id ? tax.chapters.get(q.chapter_id) : undefined;
  return {
    exam: tax.examRef(exam),
    subject: subject ? tax.subjectRef(subject) : null,
    chapter: chapter ? tax.chapterRef(chapter) : null,
  };
};

export function toListItem(q: QuestionRow, tax: TaxIndex): AdminQuestionListItem {
  return {
    id: q.id,
    slug: q.slug,
    question_type: q.question_type,
    origin: q.origin,
    verification_status: q.verification_status,
    publication_status: q.publication_status,
    ingestion_status: q.ingestion_status,
    indexability: q.indexability,
    is_indexable: q.is_indexable,
    sitemap_include: q.sitemap_include,
    difficulty: q.difficulty,
    ...refs(q, tax),
    year: q.year,
    updated_at: iso(q.updated_at),
    row_version: q.row_version,
  };
}

async function adminDto(r: ServiceRepos, q: QuestionRow): Promise<AdminQuestion> {
  const tax = new TaxIndex(await r.taxonomy.load());
  const [options, versions, paper, source] = await Promise.all([
    r.admin.optionsFor(q.id),
    r.admin.solutionVersions(q.id),
    q.paper_id ? r.admin.paperById(q.paper_id) : Promise.resolve(null),
    q.source_id ? r.admin.getSource(q.source_id) : Promise.resolve(null),
  ]);
  const topic = q.topic_id ? tax.topics.get(q.topic_id) : undefined;
  return {
    ...toListItem(q, tax),
    topic: topic ? tax.topicRef(topic) : null,
    paper: paper
      ? { slug: paper.slug, title: paper.title, year: paper.year, session_label: paper.session_label, exam_date: paper.exam_date, shift: paper.shift, paper_code: paper.paper_code }
      : null,
    question_text: q.question_text,
    structured_content: q.structured_content,
    options: [...options]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({ id: o.id, label: o.label, content: o.content, external_option_id: o.external_option_id })),
    answer_key: q.answer_key,
    answer_key_source: q.answer_key_source,
    current_solution_id: q.current_solution_id,
    solution_versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      provenance: v.provenance,
      review_status: v.review_status,
      created_at: iso(v.created_at),
      ai_run_id: v.ai_run_id,
      author_id: v.author_id,
    })),
    seo_title: q.seo_title,
    seo_description: q.seo_description,
    source: source ? { id: source.id, code: source.code, name: source.name } : null,
    source_question_id: q.source_question_id,
    marks: q.marks,
    negative_marks: q.negative_marks,
    published_at: isoOrNull(q.published_at),
    first_published_at: isoOrNull(q.first_published_at),
    created_at: iso(q.created_at),
  };
}

function toSolutionFull(s: SolutionRow): SolutionVersionFull {
  return {
    id: s.id,
    version: s.version,
    final_answer: s.final_answer,
    summary: s.summary,
    steps: s.steps as SolutionVersionFull['steps'],
    formulas: s.formulas as SolutionVersionFull['formulas'],
    concepts: s.concepts,
    alternatives: s.alternatives as SolutionVersionFull['alternatives'],
    shortcuts: s.shortcuts,
    common_mistakes: s.common_mistakes,
    sympy_checks: s.sympy_checks,
    provenance: s.provenance,
    review_status: s.review_status,
    based_on_version_id: s.based_on_version_id,
    ai_run_id: s.ai_run_id,
    author_id: s.author_id,
    edit_note: s.edit_note,
    reviewed_by: s.reviewed_by,
    reviewed_at: isoOrNull(s.reviewed_at),
    created_at: iso(s.created_at),
  };
}

async function mustGet(r: ServiceRepos, id: string): Promise<QuestionRow> {
  const q = await r.admin.getQuestion(id);
  if (!q) throw notFound('Question');
  return q;
}
function checkVersion(q: QuestionRow, expected: number): void {
  if (q.row_version !== expected) {
    throw new ApiError('VERSION_CONFLICT', 'Question was modified by someone else', { details: { current_row_version: q.row_version } });
  }
}
async function save(r: ServiceRepos, q: QuestionRow, expected: number, patch: QuestionPatch, opts?: { allowSlugChange?: boolean }): Promise<QuestionRow> {
  const res = await r.admin.updateQuestion(q.id, expected, patch, opts);
  if (res === null) throw notFound('Question');
  if (res === 'CONFLICT') {
    const cur = await r.admin.getQuestion(q.id);
    throw new ApiError('VERSION_CONFLICT', 'Question was modified by someone else', { details: { current_row_version: cur?.row_version ?? null } });
  }
  return res;
}

/** Validate that an answer key is consistent with a question type and option set. */
function checkKeyAgainst(key: AnswerKey, type: QuestionRow['question_type'], options: readonly OptionRow[], field: string): void {
  if (key.type !== type) throw validation(`${field}.type must be ${type}`, [{ path: `${field}.type`, message: `must be ${type}` }]);
  if (key.type !== 'NUMERICAL') {
    const ids = new Set(options.map((o) => o.id));
    if (!key.correct_option_ids.every((id) => ids.has(id))) {
      throw validation(`${field} references unknown option ids`, [{ path: `${field}.correct_option_ids`, message: 'unknown option id' }]);
    }
    if (key.type === 'SINGLE_MCQ' && key.correct_option_ids.length < 1) throw validation('SINGLE_MCQ needs at least one correct option');
  } else {
    for (const rg of key.accepted_ranges) {
      // min <= max
      if (Number.isNaN(Number(rg.min)) || Number.isNaN(Number(rg.max))) throw validation('invalid range');
    }
  }
}

// ------------------------------------------------------------------ queries
export async function listQuestions(
  c: AdminCtx,
  f: {
    verification?: VerificationStatus[] | undefined;
    publication?: ('DRAFT' | 'PUBLISHED' | 'ARCHIVED')[] | undefined;
    ingestion?: ('IMPORTED' | 'CLASSIFIED' | 'SOLVED' | 'CHECKED' | 'NEEDS_ATTENTION')[] | undefined;
    exam?: string | undefined;
    subject?: string | undefined;
    chapter?: string | undefined;
    origin?: QuestionRow['origin'] | undefined;
    q?: string | undefined;
    cursor: PageCursor | null;
    limit: number;
  },
): Promise<Out<AdminQuestionListItem[]>> {
  return c.store.service(async (r) => {
    const tax = new TaxIndex(await r.taxonomy.load());
    const examId = f.exam ? (tax.examBySlug.get(f.exam)?.id ?? 'none') : undefined;
    const subjectId = f.subject ? (tax.subjectBySlug.get(f.subject)?.id ?? 'none') : undefined;
    const chapterId = f.chapter ? (tax.chapterBySlug.get(f.chapter)?.id ?? 'none') : undefined;
    const rows = await r.admin.listQuestions(
      { verification: f.verification, publication: f.publication, ingestion: f.ingestion, examId, subjectId, chapterId, origin: f.origin, q: f.q },
      f.cursor,
      f.limit + 1,
    );
    const page = paginate(rows, f.limit);
    return { data: page.rows.map((q) => toListItem(q, tax)), meta: page.meta, tags: [] };
  });
}

export async function getQuestion(c: AdminCtx, id: string): Promise<AdminQuestion> {
  return c.store.service(async (r) => adminDto(r, await mustGet(r, id)));
}

export async function getSolution(c: AdminCtx, id: string, versionId: string): Promise<SolutionVersionFull> {
  return c.store.service(async (r) => {
    await mustGet(r, id);
    const s = await r.admin.getSolution(versionId);
    if (!s || s.question_id !== id) throw notFound('Solution version');
    return toSolutionFull(s);
  });
}

export async function verificationQueue(
  c: AdminCtx,
  f: { status?: VerificationStatus[] | undefined; exam?: string | undefined; cursor: PageCursor | null; limit: number },
) {
  const status: VerificationStatus[] = f.status ?? ['HUMAN_REVIEW_REQUIRED', 'DISPUTED', 'AUTOMATED_CHECKS_PASSED', 'OFFICIAL_KEY_MATCHED'];
  return c.store.service(async (r) => {
    const tax = new TaxIndex(await r.taxonomy.load());
    const examId = f.exam ? (tax.examBySlug.get(f.exam)?.id ?? 'none') : undefined;
    const rows = await r.admin.listQuestions({ verification: status, examId }, f.cursor, f.limit + 1);
    const page = paginate(rows, f.limit);
    const runs = await r.admin.latestRuns(page.rows.map((q) => q.id));
    return {
      data: page.rows.map((q) => {
        const run = runs.get(q.id);
        return { ...toListItem(q, tax), latest_run: run ? { outcome: run.outcome, reasons: run.reasons, finished_at: isoOrNull(run.finished_at) } : null };
      }),
      meta: page.meta,
      tags: [],
    };
  });
}

export async function verificationDetail(c: AdminCtx, id: string) {
  return c.store.service(async (r) => {
    await mustGet(r, id);
    const [runs, ai, events] = await Promise.all([r.admin.verificationRuns(id), r.admin.aiRuns(id), r.admin.reviewEvents(id)]);
    return {
      runs: runs.map(({ run, checks }) => ({
        id: run.id,
        rules_version: run.rules_version,
        outcome: run.outcome,
        resulting_status: run.resulting_status,
        reasons: run.reasons,
        started_at: iso(run.started_at),
        finished_at: isoOrNull(run.finished_at),
        checks: checks.map((k) => ({ kind: k.kind, result: k.result, details: k.details, ai_run_id: k.ai_run_id })),
      })),
      ai_runs: ai.map((a) => ({ ...a, created_at: iso(a.created_at) })),
      review_events: events.map((e) => ({
        action: e.action,
        actor_id: e.actor_id,
        from_verification_status: e.from_verification_status,
        to_verification_status: e.to_verification_status,
        from_publication_status: e.from_publication_status,
        to_publication_status: e.to_publication_status,
        note: e.note,
        created_at: iso(e.created_at),
      })),
    };
  });
}

// ------------------------------------------------------------------ mutations
const CONTENT_FIELDS = ['structured_content', 'options', 'question_type', 'answer_key', 'marks', 'negative_marks'] as const;
const ADMIN_ONLY_FIELDS = ['indexability', 'sitemap_include', 'slug'] as const;

export async function patchQuestion(c: AdminCtx, id: string, body: PatchQuestionBody): Promise<AdminQuestion> {
  const touched = (k: keyof PatchQuestionBody) => body[k] !== undefined;
  const contentChange = CONTENT_FIELDS.some(touched);
  if (contentChange && !isAdmin(c)) throw new ApiError('FORBIDDEN', 'Content edits require the ADMIN role');
  if (ADMIN_ONLY_FIELDS.some(touched) && !isAdmin(c)) throw new ApiError('FORBIDDEN', 'Indexability, sitemap and slug edits require the ADMIN role');

  const out = await c.store.service(async (r) => {
    const q = await mustGet(r, id);
    checkVersion(q, body.expected_row_version);
    if (contentChange && q.publication_status === 'PUBLISHED') {
      throw invalidState(q.publication_status, 'edit_content', 'Unpublish the question before editing its content');
    }
    const tax = new TaxIndex(await r.taxonomy.load());
    const patch: QuestionPatch = {};
    const type = body.question_type ?? q.question_type;
    let options = await r.admin.optionsFor(q.id);

    if (body.question_type !== undefined) patch.question_type = body.question_type;
    if (type === 'NUMERICAL' && body.options && body.options.length > 0) throw validation('NUMERICAL questions have no options', [{ path: 'options', message: 'must be empty' }]);
    if (body.structured_content) {
      patch.structured_content = body.structured_content;
      patch.question_text = blocksToText(body.structured_content).slice(0, 20000);
    }
    if (body.options) {
      const labels = new Set(body.options.map((o) => o.label));
      if (labels.size !== body.options.length) throw validation('duplicate option labels', [{ path: 'options', message: 'labels must be unique' }]);
      options = await r.admin.upsertOptionsByLabel(
        q.id,
        body.options.map((o) => ({ label: o.label, sort_order: 'ABCDE'.indexOf(o.label), content: o.content, content_text: blocksToText(o.content) })),
      );
    }
    if (body.answer_key) {
      checkKeyAgainst(body.answer_key, type, options, 'answer_key');
      patch.answer_key = canonicalizeAnswerKey(body.answer_key);
      patch.answer_key_source = 'HUMAN';
    }
    if (body.marks !== undefined) patch.marks = body.marks;
    if (body.negative_marks !== undefined) patch.negative_marks = body.negative_marks;
    if (body.difficulty !== undefined) patch.difficulty = body.difficulty;
    if (body.seo_title !== undefined) patch.seo_title = body.seo_title;
    if (body.seo_description !== undefined) patch.seo_description = body.seo_description;
    if (body.indexability !== undefined) patch.indexability = body.indexability;
    if (body.sitemap_include !== undefined) patch.sitemap_include = body.sitemap_include;

    const oldTags = purgeTagsFor(q);
    if (body.chapter !== undefined) {
      const ch = tax.chapterBySlug.get(body.chapter);
      const sub = ch ? tax.subjects.get(ch.subject_id) : undefined;
      if (!ch || !sub) throw notFound('Chapter');
      if (sub.exam_id !== q.exam_id) throw validation('Chapter belongs to a different exam', [{ path: 'chapter', message: 'wrong exam' }]);
      patch.chapter_id = ch.id;
      patch.subject_id = sub.id;
      if (body.topic === undefined && q.topic_id && tax.topics.get(q.topic_id)?.chapter_id !== ch.id) patch.topic_id = null;
    }
    if (body.topic !== undefined) {
      if (body.topic === null) patch.topic_id = null;
      else {
        const t = tax.topicBySlug.get(body.topic);
        const chId = patch.chapter_id ?? q.chapter_id;
        if (!t || t.chapter_id !== chId) throw validation('Topic does not belong to the chapter', [{ path: 'topic', message: 'wrong chapter' }]);
        patch.topic_id = t.id;
      }
    }
    if (body.slug !== undefined && body.slug !== q.slug) patch.slug = body.slug;

    if (contentChange) {
      if (q.verification_status !== 'PENDING' && q.verification_status !== 'DISPUTED') patch.verification_status = 'HUMAN_REVIEW_REQUIRED';
      if (q.ingestion_status === 'NEEDS_ATTENTION') {
        patch.ingestion_status = 'IMPORTED';
        const hash = await sha256Hex(canonicalJson({ t: patch.question_text ?? q.question_text }));
        await r.admin.enqueueJob({ kind: 'AI_CLASSIFY', idempotency_key: `AI_CLASSIFY:${q.id}:${hash}`, payload: { question_id: q.id }, question_id: q.id, created_by: c.user.id });
      }
    }

    const after = await save(r, q, body.expected_row_version, patch, { allowSlugChange: patch.slug !== undefined && isAdmin(c) });
    const action = contentChange ? 'EDIT_CONTENT' : body.indexability !== undefined || body.sitemap_include !== undefined ? 'SET_INDEXABILITY' : 'EDIT_CONTENT';
    await event(r, c, q, after, action, null);
    await audit(r, c, 'question.patch', 'question', q.id, { fields: Object.keys(body).filter((k) => k !== 'expected_row_version') });
    const dto = await adminDto(r, after);
    const wasLive = q.publication_status === 'PUBLISHED';
    return { dto, tags: wasLive ? [...oldTags, ...purgeTagsFor(after)] : [] };
  });
  if (out.tags.length) purge(c, out.tags);
  return out.dto;
}

export async function createSolution(c: AdminCtx, id: string, body: CreateSolutionBody): Promise<SolutionVersionFull> {
  return c.store.service(async (r) => {
    const q = await mustGet(r, id);
    const options = await r.admin.optionsFor(id);
    checkKeyAgainst(body.final_answer, q.question_type, options, 'final_answer');
    let provenance: SolutionRow['provenance'] = 'HUMAN_AUTHORED';
    if (body.based_on_version_id) {
      const base = await r.admin.getSolution(body.based_on_version_id);
      if (!base || base.question_id !== id) throw validation('based_on_version_id does not belong to this question', [{ path: 'based_on_version_id', message: 'unknown version' }]);
      if (base.provenance === 'AI_GENERATED' || base.provenance === 'AI_HUMAN_EDITED') provenance = 'AI_HUMAN_EDITED';
    }
    const sol = await r.admin.insertSolution({
      question_id: id,
      final_answer: canonicalizeAnswerKey(body.final_answer),
      summary: body.summary ?? null,
      steps: body.steps,
      formulas: body.formulas ?? [],
      concepts: body.concepts ?? [],
      alternatives: body.alternatives ?? [],
      shortcuts: body.shortcuts ?? [],
      common_mistakes: body.common_mistakes ?? [],
      provenance,
      based_on_version_id: body.based_on_version_id ?? null,
      author_id: c.user.id,
      edit_note: body.edit_note,
    });
    await event(r, c, q, q, 'EDIT_SOLUTION', body.edit_note, sol.id);
    await audit(r, c, 'solution.create', 'solution_version', sol.id, { question_id: id, version: sol.version });
    return toSolutionFull(sol);
  });
}

export async function approve(c: AdminCtx, id: string, body: ApproveBody): Promise<AdminQuestion> {
  const out = await c.store.service(async (r) => {
    const q = await mustGet(r, id);
    checkVersion(q, body.expected_row_version);
    const from = q.verification_status;
    if (!['AUTOMATED_CHECKS_PASSED', 'OFFICIAL_KEY_MATCHED', 'HUMAN_REVIEW_REQUIRED', 'DISPUTED'].includes(from)) throw invalidState(from, 'approve');
    // A dispute is unresolved if the status is DISPUTED OR the latest dispute event was never resolved (status may have been
    // moved off DISPUTED by a pipeline run); either way only an ADMIN may clear it.
    const lastDisputeEvent = from === 'DISPUTED' ? null : (await r.admin.reviewEvents(id)).find((e) => e.action === 'MARK_DISPUTED' || e.action === 'RESOLVE_DISPUTE');
    const disputeOpen = from === 'DISPUTED' || lastDisputeEvent?.action === 'MARK_DISPUTED';
    if (disputeOpen && !isAdmin(c)) throw new ApiError('FORBIDDEN', 'Resolving a dispute requires the ADMIN role');
    const sol = await r.admin.getSolution(body.solution_version_id);
    if (!sol || sol.question_id !== id) throw notFound('Solution version');
    if (sol.review_status === 'REJECTED' || sol.review_status === 'SUPERSEDED') throw invalidState(sol.review_status, 'approve', 'Solution version was rejected or superseded');
    const options = await r.admin.optionsFor(id);
    checkKeyAgainst(sol.final_answer, q.question_type, options, 'final_answer');

    const patch: QuestionPatch = { current_solution_id: sol.id, verification_status: 'HUMAN_VERIFIED' };
    let note = body.note ?? null;
    const official = q.answer_key && q.answer_key_source === 'OFFICIAL';
    if (official && !answerKeysEqual(q.answer_key, sol.final_answer)) {
      if (!body.override_official_key) {
        throw new ApiError('VALIDATION_ERROR', 'Solution answer differs from the official answer key', {
          status: 422,
          details: { reason: 'OFFICIAL_KEY_MISMATCH' },
        });
      }
      if (!isAdmin(c)) throw new ApiError('FORBIDDEN', 'Overriding the official key requires the ADMIN role');
      patch.answer_key_source = 'HUMAN';
      note = `OVERRIDE OFFICIAL KEY: ${body.override_official_key.reason}${note ? ` | ${note}` : ''}`;
    } else if (!q.answer_key || !answerKeysEqual(q.answer_key, sol.final_answer)) {
      patch.answer_key_source = 'HUMAN';
    }
    // Always store the canonical final answer of the approved solution so the DB publish guard cannot mismatch.
    patch.answer_key = canonicalizeAnswerKey(sol.final_answer);
    await r.admin.setSolutionReview(sol.id, 'APPROVED', c.user.id);
    await r.admin.supersedeApproved(id, sol.id);
    const after = await save(r, q, body.expected_row_version, patch);
    await event(r, c, q, after, from === 'DISPUTED' ? 'RESOLVE_DISPUTE' : 'APPROVE', note, sol.id);
    await audit(r, c, 'question.approve', 'question', id, { solution_version_id: sol.id, override: !!body.override_official_key });
    return { dto: await adminDto(r, after), tags: q.publication_status === 'PUBLISHED' ? purgeTagsFor(after) : [] };
  });
  if (out.tags.length) purge(c, out.tags);
  return out.dto;
}

export async function reject(c: AdminCtx, id: string, body: RejectBody): Promise<AdminQuestion> {
  const out = await c.store.service(async (r) => {
    const q = await mustGet(r, id);
    const patch: QuestionPatch = {};
    let solId: string | null = null;
    if (body.target === 'SOLUTION') {
      if (!body.solution_version_id) throw validation('solution_version_id is required for target SOLUTION', [{ path: 'solution_version_id', message: 'required' }]);
      const sol = await r.admin.getSolution(body.solution_version_id);
      if (!sol || sol.question_id !== id) throw notFound('Solution version');
      if (sol.review_status === 'REJECTED') throw invalidState(sol.review_status, 'reject');
      if (q.current_solution_id === sol.id && q.publication_status === 'PUBLISHED') {
        throw invalidState(q.publication_status, 'reject_solution', 'Unpublish before rejecting the live solution');
      }
      solId = sol.id;
      await r.admin.setSolutionReview(sol.id, 'REJECTED', c.user.id);
      // Only rejecting the CURRENT solution downgrades verification (never clears a DISPUTED flag).
      if (q.current_solution_id === sol.id) {
        if (q.verification_status !== 'DISPUTED') patch.verification_status = 'HUMAN_REVIEW_REQUIRED';
        patch.current_solution_id = null;
      }
      if (body.regenerate) {
        const hash = q.content_hash ?? (await sha256Hex(canonicalJson({ t: q.question_text })));
        const suffix = Math.floor(c.deps.clock().getTime() / 1000);
        await r.admin.enqueueJob({ kind: 'AI_SOLVE', idempotency_key: `AI_SOLVE:${id}:${hash}:v1:force-${suffix}`, payload: { question_id: id }, question_id: id, created_by: c.user.id });
      }
    } else {
      if (q.publication_status === 'ARCHIVED') throw invalidState(q.publication_status, 'reject_question');
      patch.publication_status = 'ARCHIVED';
    }
    const after = Object.keys(patch).length ? await save(r, q, q.row_version, patch) : q;
    await event(r, c, q, after, body.target === 'SOLUTION' ? 'REJECT_SOLUTION' : 'REJECT_QUESTION', body.reason, solId);
    await audit(r, c, 'question.reject', 'question', id, { target: body.target, regenerate: !!body.regenerate });
    return { dto: await adminDto(r, after), tags: q.publication_status === 'PUBLISHED' ? purgeTagsFor(after) : [] };
  });
  if (out.tags.length) purge(c, out.tags);
  return out.dto;
}

export function publishUnmet(q: QuestionRow, options: readonly OptionRow[], current: SolutionRow | null): string[] {
  const unmet: string[] = [];
  // Mirrors migration 0020: AI-generated practice items may publish once automated checks pass.
  const aiChecked = q.origin === 'AI_GENERATED' && q.verification_status === 'AUTOMATED_CHECKS_PASSED';
  if (q.verification_status !== 'OFFICIAL_KEY_MATCHED' && q.verification_status !== 'HUMAN_VERIFIED' && !aiChecked) {
    unmet.push('verification_status must be OFFICIAL_KEY_MATCHED or HUMAN_VERIFIED (AUTOMATED_CHECKS_PASSED allowed for AI_GENERATED)');
  }
  if (!q.current_solution_id || !current) unmet.push('current_solution_id is required');
  else if (current.question_id !== q.id || current.review_status !== 'APPROVED') unmet.push('current solution must be APPROVED and belong to the question');
  if (!q.answer_key) unmet.push('answer_key is required');
  else if (current && !answerKeysEqual(q.answer_key, current.final_answer)) unmet.push('answer_key must equal the current solution final_answer');
  if (!q.subject_id) unmet.push('subject_id is required');
  if (!q.chapter_id) unmet.push('chapter_id is required');
  if (!q.difficulty) unmet.push('difficulty is required');
  if (q.question_type === 'NUMERICAL') {
    if (options.length > 0) unmet.push('NUMERICAL questions must have no options');
  } else {
    if (options.length < 2) unmet.push('MCQ questions need at least 2 options');
    const ids = new Set(options.map((o) => o.id));
    if (q.answer_key && q.answer_key.type !== 'NUMERICAL' && !q.answer_key.correct_option_ids.every((x) => ids.has(x))) {
      unmet.push('every correct option id must be an option of this question');
    }
  }
  return unmet;
}

export async function publish(c: AdminCtx, id: string, body: PublishBody): Promise<AdminQuestion> {
  const out = await c.store.service(async (r) => {
    const q = await mustGet(r, id);
    checkVersion(q, body.expected_row_version);
    if (q.publication_status !== 'DRAFT') throw invalidState(q.publication_status, 'publish');
    const options = await r.admin.optionsFor(id);
    const current = q.current_solution_id ? await r.admin.getSolution(q.current_solution_id) : null;
    const unmet = publishUnmet(q, options, current);
    if (unmet.length) throw new ApiError('PUBLISH_REQUIREMENTS_NOT_MET', 'Publish requirements not met', { details: { unmet } });

    // copy referenced assets to PUBLIC_ASSETS (idempotent, content-addressed)
    const ids = collectAssetIds(q.structured_content);
    for (const o of options) collectAssetIds(o.content, ids);
    if (current) {
      for (const s of parseSteps(current.steps)) collectAssetIds(s.blocks, ids);
      for (const a of current.alternatives as { steps?: unknown[] }[]) if (Array.isArray(a.steps)) for (const s of parseSteps(a.steps)) collectAssetIds(s.blocks, ids);
    }
    if (ids.size > 0) {
      const assets = await r.content.assetsByIds([...ids]);
      const missing = [...ids].filter((x) => !assets.some((a) => a.id === x));
      if (missing.length) throw new ApiError('PUBLISH_REQUIREMENTS_NOT_MET', 'Publish requirements not met', { details: { unmet: missing.map((m) => `image asset ${m} does not exist`) } });
      for (const a of assets) {
        if (a.bucket === 'PUBLIC_ASSETS') continue;
        const ext = a.mime_type === 'image/png' ? 'png' : a.mime_type === 'image/jpeg' ? 'jpg' : 'webp';
        const key = r2Keys.publicAsset(a.sha256, ext);
        try {
          await copyObject(c.deps.storage.SOURCE_DOCS, a.r2_key, c.deps.storage.PUBLIC_ASSETS, key, { cacheControl: 'public, max-age=31536000, immutable' });
        } catch (e) {
          c.deps.logger.error('asset copy failed', { asset_id: a.id, error: String(e) });
          throw new ApiError('PUBLISH_REQUIREMENTS_NOT_MET', 'Publish requirements not met', { details: { unmet: [`image asset ${a.id} could not be copied to public storage`] } });
        }
        await r.admin.moveAssetToPublic(a.id, key);
      }
    }
    const after = await save(r, q, body.expected_row_version, { publication_status: 'PUBLISHED' });
    await event(r, c, q, after, 'PUBLISH', null, q.current_solution_id);
    await audit(r, c, 'question.publish', 'question', id, {});
    return { dto: await adminDto(r, after), tags: purgeTagsFor(after) };
  });
  purge(c, out.tags);
  return out.dto;
}

async function transition(
  c: AdminCtx,
  id: string,
  body: TransitionBody,
  rule: { action: string; allowedFrom: QuestionRow['publication_status'][]; to: QuestionRow['publication_status']; review: ReviewEventRow['action'] },
): Promise<AdminQuestion> {
  const out = await c.store.service(async (r) => {
    const q = await mustGet(r, id);
    checkVersion(q, body.expected_row_version);
    if (!rule.allowedFrom.includes(q.publication_status)) throw invalidState(q.publication_status, rule.action);
    const after = await save(r, q, body.expected_row_version, { publication_status: rule.to });
    await event(r, c, q, after, rule.review, body.reason);
    await audit(r, c, `question.${rule.action}`, 'question', id, { reason: body.reason });
    return { dto: await adminDto(r, after), tags: q.publication_status === 'PUBLISHED' || rule.to === 'PUBLISHED' ? purgeTagsFor(after) : [] };
  });
  if (out.tags.length) purge(c, out.tags);
  return out.dto;
}
export const unpublish = (c: AdminCtx, id: string, b: TransitionBody) =>
  transition(c, id, b, { action: 'unpublish', allowedFrom: ['PUBLISHED'], to: 'DRAFT', review: 'UNPUBLISH' });
export const archive = (c: AdminCtx, id: string, b: TransitionBody) =>
  transition(c, id, b, { action: 'archive', allowedFrom: ['DRAFT', 'PUBLISHED'], to: 'ARCHIVED', review: 'ARCHIVE' });
export const restore = (c: AdminCtx, id: string, b: TransitionBody) =>
  transition(c, id, b, { action: 'restore', allowedFrom: ['ARCHIVED'], to: 'DRAFT', review: 'RESTORE' });

export async function dispute(c: AdminCtx, id: string, body: DisputeBody): Promise<AdminQuestion> {
  const out = await c.store.service(async (r) => {
    const q = await mustGet(r, id);
    if (q.verification_status === 'DISPUTED') throw invalidState(q.verification_status, 'dispute');
    const after = await save(r, q, q.row_version, { verification_status: 'DISPUTED' });
    await event(r, c, q, after, 'MARK_DISPUTED', body.reason);
    await audit(r, c, 'question.dispute', 'question', id, { reason: body.reason });
    return { dto: await adminDto(r, after), tags: q.publication_status === 'PUBLISHED' ? purgeTagsFor(after) : [] };
  });
  if (out.tags.length) purge(c, out.tags);
  return out.dto;
}

export async function runVerification(c: AdminCtx, id: string, body: VerificationRunBody): Promise<{ job_ids: string[]; existing_job_ids: string[]; message: string }> {
  return c.store.service(async (r) => {
    const q = await mustGet(r, id);
    const stages = body.stages ?? ['VERIFY'];
    const suffix = body.force ? `:force-${Math.floor(c.deps.clock().getTime() / 1000)}` : '';
    const hash = q.content_hash ?? (await sha256Hex(canonicalJson({ t: q.question_text })));
    const ids: string[] = [];
    const existing: string[] = [];
    for (const st of stages) {
      let kind: 'AI_CLASSIFY' | 'AI_SOLVE' | 'AI_VERIFY' | 'AI_SEO';
      let key: string;
      const payload: Record<string, unknown> = { question_id: id };
      if (st === 'CLASSIFY') (kind = 'AI_CLASSIFY', (key = `AI_CLASSIFY:${id}:${hash}`));
      else if (st === 'SOLVE') (kind = 'AI_SOLVE', (key = `AI_SOLVE:${id}:${hash}:v1`));
      else if (st === 'VERIFY') {
        const solId = q.current_solution_id ?? (await r.admin.solutionVersions(id))[0]?.id;
        if (!solId) throw validation('No solution version to verify', [{ path: 'stages', message: 'run SOLVE first' }]);
        payload.solution_version_id = solId;
        // AI_PIPELINE section 4: AI_VERIFY:{qid}:{solution_version_id}:{rules_version}
        (kind = 'AI_VERIFY', (key = `AI_VERIFY:${id}:${solId}:${VERIFY_RULES_VERSION}`));
      } else {
        if (!q.current_solution_id) throw validation('SEO needs a current solution', [{ path: 'stages', message: 'no current solution' }]);
        (kind = 'AI_SEO', (key = `AI_SEO:${id}:${q.current_solution_id}`));
      }
      const fullKey = key + suffix;
      const prior = await r.admin.findJobByKey(fullKey);
      if (prior) existing.push(prior.id);
      else ids.push(await r.admin.enqueueJob({ kind, idempotency_key: fullKey, payload, question_id: id, created_by: c.user.id }));
    }
    await audit(r, c, 'question.verification.run', 'question', id, { stages, force: !!body.force, enqueued: ids.length, existing: existing.length });
    const message = existing.length
      ? `${existing.length} identical job(s) already exist (${existing.join(', ')}); ${ids.length} new job(s) enqueued. Use force=true to re-run.`
      : `${ids.length} job(s) enqueued.`;
    return { job_ids: [...ids, ...existing], existing_job_ids: existing, message };
  });
}

// ------------------------------------------------------------------ sources & ingestion (admin only)
export async function listSources(c: AdminCtx, cursor: PageCursor | null, limit: number) {
  return c.store.service(async (r) => {
    const page = paginate(await r.admin.listSources(cursor, limit + 1), limit);
    return { data: page.rows.map(toSource), meta: page.meta, tags: [] };
  });
}
type SourceRowT = Awaited<ReturnType<ServiceRepos['admin']['getSource']>> & object;
const toSource = (s: SourceRowT) => ({
  id: s.id,
  code: s.code,
  name: s.name,
  kind: s.kind,
  reuse_permitted: s.reuse_permitted,
  approved_at: isoOrNull(s.approved_at),
  license_name: s.license_name,
  license_url: s.license_url,
  attribution_text: s.attribution_text,
});

export async function createSource(c: AdminCtx, b: import('@projectx/contracts').CreateSourceBody) {
  if (b.reuse_permitted) {
    throw new ApiError('VALIDATION_ERROR', 'Sources are registered with reuse_permitted=false; use POST /admin/sources/{id}/approve to grant reuse', {
      status: 422,
      details: [{ path: 'reuse_permitted', message: 'must be false on creation' }],
    });
  }
  return c.store.service(async (r) => {
    const s = await r.admin.insertSource({
      code: b.code,
      name: b.name,
      kind: b.kind,
      publisher: b.publisher ?? null,
      homepage_url: b.homepage_url ?? null,
      license_name: b.license_name ?? null,
      license_url: b.license_url ?? null,
      reuse_permitted: b.reuse_permitted,
      attribution_text: b.attribution_text ?? null,
      notes: b.notes ?? null,
    });
    await audit(r, c, 'source.create', 'source', s.id, { code: s.code });
    return toSource(s);
  });
}

export async function approveSource(c: AdminCtx, id: string, b: import('@projectx/contracts').ApproveSourceBody) {
  return c.store.service(async (r) => {
    const s = await r.admin.approveSource(id, c.user.id, { name: b.license_name, url: b.license_url ?? null }, b.note);
    if (!s) throw notFound('Source');
    await audit(r, c, 'source.approve', 'source', id, { license_name: b.license_name, note: b.note });
    return toSource(s);
  });
}

export async function listDocuments(c: AdminCtx, source: string | undefined, cursor: PageCursor | null, limit: number) {
  return c.store.service(async (r) => {
    const page = paginate(await r.admin.listDocuments(source, cursor, limit + 1), limit);
    return {
      data: page.rows.map((d) => ({
        id: d.id,
        source_code: d.source_code,
        paper_slug: d.paper_slug,
        kind: d.kind,
        original_filename: d.original_filename,
        bytes: Number(d.bytes),
        page_count: d.page_count,
        created_at: iso(d.created_at),
        latest_job: d.latest_job,
        question_counts: d.question_counts,
      })),
      meta: page.meta,
      tags: [],
    };
  });
}

const toJob = (j: import('../repositories/types').JobRow) => ({
  id: j.id,
  kind: j.kind,
  status: j.status,
  attempts: j.attempts,
  max_attempts: j.max_attempts,
  priority: j.priority,
  idempotency_key: j.idempotency_key,
  run_after: iso(j.run_after),
  locked_by: j.locked_by,
  last_error: j.last_error,
  question_id: j.question_id,
  source_document_id: j.source_document_id,
  created_at: iso(j.created_at),
  finished_at: isoOrNull(j.finished_at),
});

export async function listJobs(
  c: AdminCtx,
  f: { status?: import('../repositories/types').JobRow['status'][] | undefined; kind?: import('../repositories/types').JobRow['kind'][] | undefined; cursor: PageCursor | null; limit: number },
) {
  return c.store.service(async (r) => {
    const page = paginate(await r.admin.listJobs({ status: f.status, kind: f.kind }, f.cursor, f.limit + 1), f.limit);
    return { data: page.rows.map(toJob), meta: page.meta, tags: [] };
  });
}

export async function getJob(c: AdminCtx, id: string) {
  return c.store.service(async (r) => {
    const j = await r.admin.getJob(id);
    if (!j) throw notFound('Job');
    const events = await r.admin.jobEvents(id, 500);
    return { ...toJob(j), events: events.map((e) => ({ level: e.level, stage: e.stage, message: e.message, data: e.data ?? null, created_at: iso(e.created_at) })) };
  });
}

export async function retryJob(c: AdminCtx, id: string) {
  return c.store.service(async (r) => {
    const j = await r.admin.getJob(id);
    if (!j) throw notFound('Job');
    if (j.status !== 'DEAD' && j.status !== 'CANCELLED') throw invalidState(j.status, 'retry');
    const n = await r.admin.retryJob(id);
    if (!n) throw invalidState(j.status, 'retry');
    await audit(r, c, 'job.retry', 'pipeline_job', id, {});
    return toJob(n);
  });
}
export async function cancelJob(c: AdminCtx, id: string) {
  return c.store.service(async (r) => {
    const j = await r.admin.getJob(id);
    if (!j) throw notFound('Job');
    if (j.status !== 'QUEUED' && j.status !== 'RUNNING') throw invalidState(j.status, 'cancel');
    const n = await r.admin.cancelJob(id);
    if (!n) throw invalidState(j.status, 'cancel');
    await audit(r, c, 'job.cancel', 'pipeline_job', id, {});
    return toJob(n);
  });
}

export async function listSourceQuestions(
  c: AdminCtx,
  f: { documentId: string; status?: import('../repositories/types').SourceQuestionRow['status'] | undefined; cursor: PageCursor | null; limit: number },
) {
  return c.store.service(async (r) => {
    const page = paginate(await r.admin.listSourceQuestions({ documentId: f.documentId, status: f.status }, f.cursor, f.limit + 1), f.limit);
    return { data: page.rows.map((x) => ({ ...x, _k: undefined, _id: undefined })).map(stripKeys), meta: page.meta, tags: [] };
  });
}
function stripKeys<T extends { _k?: unknown; _id?: unknown }>(x: T): Omit<T, '_k' | '_id'> {
  const { _k, _id, ...rest } = x;
  void _k;
  void _id;
  return rest;
}

export async function promoteSourceQuestion(c: AdminCtx, id: string, b: { exam: string; subject?: import('@projectx/contracts').SubjectCode | undefined }) {
  return c.store.service(async (r) => {
    const sq = await r.admin.getSourceQuestion(id);
    if (!sq) throw notFound('Source question');
    if (sq.status !== 'NORMALIZED' && sq.status !== 'PROMOTED') throw invalidState(sq.status, 'promote');
    const tax = new TaxIndex(await r.taxonomy.load());
    const exam = tax.examBySlug.get(b.exam);
    if (!exam) throw notFound('Exam');
    const qid = await r.admin.promoteSourceQuestion(id, exam.id, b.subject ?? null);
    await audit(r, c, 'source_question.promote', 'source_question', id, { question_id: qid });
    return { question_id: qid };
  });
}

export async function rejectSourceQuestion(c: AdminCtx, id: string, reason: string): Promise<void> {
  await c.store.service(async (r) => {
    const sq = await r.admin.getSourceQuestion(id);
    if (!sq) throw notFound('Source question');
    if (sq.status === 'PROMOTED') throw invalidState(sq.status, 'reject');
    await r.admin.rejectSourceQuestion(id);
    await audit(r, c, 'source_question.reject', 'source_question', id, { reason });
  });
}

export type { Keyed };
