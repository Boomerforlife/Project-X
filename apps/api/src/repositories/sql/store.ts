import type { Db } from '@projectx/db';
import type {
  AdminRepo,
  AssetRow,
  ContentRepo,
  OptionRow,
  PaperRow,
  PracticeRepo,
  QuestionBundle,
  QuestionRow,
  ServiceRepos,
  SessionRow,
  SolutionRow,
  SourceRow,
  Store,
  StudentServiceRepo,
  TaxonomyRepo,
  UserRepo,
  AttemptRow,
  JobRow,
  QuestionPatch,
  JobEventRow,
} from '../types';
import { Params, jsonList, keyed, keysetWhere, num, textArray, textSet, uuidSet, type Tx } from './util';

const Q = `q.id, q.slug, q.exam_id, q.subject_id, q.chapter_id, q.topic_id, q.paper_id, q.origin, q.question_type, q.marking_scheme,
 q.difficulty, q.marks::text as marks, q.negative_marks::text as negative_marks, q.year, q.shift, q.session_label, q.question_number,
 q.question_text, q.structured_content, q.answer_key, q.answer_key_source, q.source_id, q.source_question_id, q.content_hash,
 q.ingestion_status, q.verification_status, q.publication_status, q.indexability, q.sitemap_include, q.current_solution_id,
 q.seo_title, q.seo_description, q.is_indexable, q.row_version, q.created_at, q.updated_at, q.published_at, q.first_published_at`;
const OPT = `o.id, o.question_id, o.label, o.sort_order, o.content, o.content_text, o.external_option_id`;
const SOL = `s.id, s.question_id, s.version, s.final_answer, s.summary, s.steps, s.formulas, s.concepts, s.alternatives, s.shortcuts,
 s.common_mistakes, s.sympy_checks, s.provenance, s.ai_run_id, s.based_on_version_id, s.author_id, s.edit_note, s.review_status,
 s.reviewed_by, s.reviewed_at, s.created_at`;
const ASSET = `a.id, a.question_id, a.solution_version_id, a.source_question_id, a.kind, a.bucket, a.r2_key, a.mime_type, a.width, a.height, a.bytes, a.sha256, a.alt_text`;
const PAPER = `p.id, p.exam_id, p.slug, p.title, p.year, p.session_label, p.exam_date::text as exam_date, p.shift, p.paper_code,
  p.numerical_negative_marks::text as numerical_negative_marks, p.numerical_counted_per_subject`;
const SRC = `s.id, s.code, s.name, s.kind, s.publisher, s.homepage_url, s.license_name, s.license_url, s.reuse_permitted, s.attribution_text, s.approved_by, s.approved_at, s.notes, s.created_at`;
const SESS = `s.id, s.user_id, s.client_request_id, s.mode, s.exam_id, s.subject_id, s.chapter_id, s.topic_id, s.paper_id, s.filters, s.question_ids,
 s.status, s.attempted_count, s.correct_count, s.score::text as score, s.started_at, s.completed_at, s.last_activity_at, s.ui_mode, s.time_limit_sec`;
const ATT = `a.id, a.user_id, a.question_id, a.session_id, a.client_attempt_id, a.request_hash, a.response, a.is_correct, a.score::text as score,
 a.time_spent_ms, a.activity_date::text as activity_date, a.submitted_at`;
const SESS_RET = `id, user_id, client_request_id, mode, exam_id, subject_id, chapter_id, topic_id, paper_id, filters, question_ids, status, attempted_count, correct_count, score::text as score, started_at, completed_at, last_activity_at, ui_mode, time_limit_sec`;
const JOB = `j.id, j.kind, j.idempotency_key, j.status, j.priority, j.attempts, j.max_attempts, j.run_after, j.locked_by, j.last_error, j.question_id, j.source_document_id, j.created_at, j.finished_at`;
const PROFILE = `p.id, p.display_name, p.timezone, p.target_exam_id, p.target_year, p.daily_goal_attempts, p.onboarding_completed_at, p.class_level, p.created_at`;

const rows = async <T>(tx: Tx, sql: string, params: readonly unknown[] = []): Promise<T[]> => (await tx.query<T>(sql, params)).rows;
const one = async <T>(tx: Tx, sql: string, params: readonly unknown[] = []): Promise<T | null> => (await rows<T>(tx, sql, params))[0] ?? null;

function taxonomyRepo(tx: Tx): TaxonomyRepo {
  return {
    load: async () => ({
      exams: await rows(tx, `select id, code, slug, name, short_name, description, is_active, sort_order from public.exams order by sort_order, id`),
      subjects: await rows(tx, `select id, exam_id, code, slug, segment, name, is_active, sort_order from public.subjects order by sort_order, id`),
      chapters: await rows(tx, `select id, subject_id, slug, segment, name, unit_number, class_level, description, is_active, sort_order from public.chapters order by sort_order, id`),
      topics: await rows(tx, `select id, chapter_id, slug, segment, name, is_active, sort_order from public.topics order by sort_order, id`),
    }),
    publishedCounts: async () =>
      (await rows<{ chapter_id: string; topic_id: string | null; n: number }>(
        tx,
        `select chapter_id, topic_id, count(*)::int as n from public.questions where publication_status='PUBLISHED' and chapter_id is not null
           and chapter_id in (select ch.id from public.chapters ch where ch.is_active) group by chapter_id, topic_id`,
      )).map((r) => ({ ...r, n: num(r.n) })),
  };
}

async function bundleFor(tx: Tx, q: QuestionRow): Promise<QuestionBundle> {
  const [options, solution, paper, source] = await Promise.all([
    rows<OptionRow>(tx, `select ${OPT} from public.question_options o where o.question_id=$1 order by o.sort_order`, [q.id]),
    q.current_solution_id ? one<SolutionRow>(tx, `select ${SOL} from public.solution_versions s where s.id=$1`, [q.current_solution_id]) : Promise.resolve(null),
    q.paper_id ? one<PaperRow>(tx, `select ${PAPER} from public.exam_papers p where p.id=$1`, [q.paper_id]) : Promise.resolve(null),
    q.source_id ? one<SourceRow>(tx, `select ${SRC} from public.sources s where s.id=$1`, [q.source_id]) : Promise.resolve(null),
  ]);
  return { question: q, options, solution, paper, source };
}

function contentRepo(tx: Tx): ContentRepo {
  const pubWhere = `q.publication_status='PUBLISHED'`;
  // Public (anonymous) surfaces never expose Plus-only questions: no page, no excerpt, no redirect, no sitemap entry.
  // Questions in an inactive chapter ("Not yet tagged", migration 0028) are published for full papers only: they stay
  // out of every public list, page, count and non-paper practice set. Sessions still load them by id (pubWhere).
  const listed = `q.chapter_id in (select ch.id from public.chapters ch where ch.is_active)`;
  const publicWhere = `${pubWhere} and q.access_tier = 'FREE' and ${listed}`;
  return {
    getPublishedBySlug: async (slug) => {
      const q = await one<QuestionRow>(tx, `select ${Q} from public.questions q where q.slug=$1 and ${publicWhere}`, [slug]);
      return q ? bundleFor(tx, q) : null;
    },
    getPublishedById: async (id) => {
      const q = await one<QuestionRow>(tx, `select ${Q} from public.questions q where q.id=$1 and ${pubWhere}`, [id]);
      return q ? bundleFor(tx, q) : null;
    },
    findRedirectTarget: async (old) =>
      (await one<{ slug: string }>(tx, `select q.slug from public.slug_redirects r join public.questions q on q.id=r.question_id where r.old_slug=$1 and ${publicWhere}`, [old]))?.slug ?? null,
    listRelated: (q, limit) =>
      rows(
        tx,
        `select ${Q} from public.questions q where ${publicWhere} and q.id<>$1 and q.chapter_id=$2
         order by (case when $3::uuid is not null and q.topic_id = $3::uuid then 1 else 0 end) desc, q.is_indexable desc, q.published_at desc, q.id limit $4`,
        [q.id, q.chapter_id, q.topic_id, limit],
      ),
    countRelated: async (q) =>
      num((await one<{ n: number }>(tx, `select count(*)::int as n from public.questions q where ${publicWhere} and q.id<>$1 and q.chapter_id=$2`, [q.id, q.chapter_id]))?.n),
    listForChapter: async (f) => {
      const p = new Params();
      const c = [`q.chapter_id=${p.add(f.chapterId)}`, publicWhere];
      if (f.topicId) c.push(`q.topic_id=${p.add(f.topicId)}`);
      if (f.difficulty) c.push(`q.difficulty=${p.add(f.difficulty)}::public.difficulty`);
      if (f.type) c.push(`q.question_type=${p.add(f.type)}::public.question_type`);
      if (f.year) c.push(`q.year=${p.add(f.year)}`);
      c.push(keysetWhere(p, f.after, ['q.published_at'], 'q.id', 'desc', ['timestamptz']));
      const r = await rows<Record<string, unknown>>(tx, `select ${Q}, q.published_at::text as _k0 from public.questions q where ${c.join(' and ')} order by q.published_at desc, q.id desc limit ${p.add(f.limit)}`, p.values);
      return keyed(r, 1) as never;
    },
    search: async (f) => {
      const p = new Params();
      const tsq = `websearch_to_tsquery('english', ${p.add(f.q)})`;
      const rank = `ts_rank(q.search_tsv, ${tsq})::float8`;
      const c = [publicWhere, `q.search_tsv @@ ${tsq}`];
      if (f.examId) c.push(`q.exam_id=${p.add(f.examId)}`);
      if (f.subjectId) c.push(`q.subject_id=${p.add(f.subjectId)}`);
      if (f.chapterId) c.push(`q.chapter_id=${p.add(f.chapterId)}`);
      c.push(keysetWhere(p, f.after, [rank], 'q.id', 'desc', ['float8']));
      const r = await rows<Record<string, unknown>>(tx, `select ${Q}, ${rank} as rank, ${rank} as _k0 from public.questions q where ${c.join(' and ')} order by ${rank} desc, q.id desc limit ${p.add(f.limit)}`, p.values);
      return keyed(r.map((x) => ({ ...x, rank: Number(x['rank']), _k0: Number(x['_k0']) })), 1) as never;
    },
    sitemap: async (after, limit) => {
      const p = new Params();
      const c = ['q.is_indexable', 'q.sitemap_include', "q.access_tier = 'FREE'", keysetWhere(p, after, ['q.updated_at'], 'q.id', 'asc', ['timestamptz'])];
      const r = await rows<Record<string, unknown>>(tx, `select q.id, q.slug, q.exam_id, q.updated_at, q.updated_at::text as _k0 from public.questions q where ${c.join(' and ')} order by q.updated_at asc, q.id asc limit ${p.add(limit)}`, p.values);
      return keyed(r, 1) as never;
    },
    listPractice: async (f, after, limit) => {
      const p = new Params();
      // Public list: premium questions are never listed (their content is Plus-only).
      const c = [pubWhere, listed, `q.exam_id=${p.add(f.examId)}`, 'q.chapter_id is not null', 'q.subject_id is not null', 'q.answer_key is not null', `q.access_tier = 'FREE'`];
      if (f.subjectId) c.push(`q.subject_id=${p.add(f.subjectId)}`);
      if (f.chapterId) c.push(`q.chapter_id=${p.add(f.chapterId)}`);
      if (f.topicId) c.push(`q.topic_id=${p.add(f.topicId)}`);
      if (f.difficulty) c.push(`q.difficulty::text in ${textSet(p.next)}`, `${p.add(jsonList(f.difficulty))}::jsonb is not null`);
      if (f.types) c.push(`q.question_type::text in ${textSet(p.next)}`, `${p.add(jsonList(f.types))}::jsonb is not null`);
      if (f.yearFrom) c.push(`q.year >= ${p.add(f.yearFrom)}`);
      if (f.yearTo) c.push(`q.year <= ${p.add(f.yearTo)}`);
      if (f.origin) c.push(`q.origin=${p.add(f.origin)}::public.question_origin`);
      c.push(keysetWhere(p, after, ['q.published_at'], 'q.id', 'desc', ['timestamptz']));
      const r = await rows<Record<string, unknown>>(tx, `select ${Q}, q.published_at::text as _k0 from public.questions q where ${c.join(' and ')} order by q.published_at desc, q.id desc limit ${p.add(limit)}`, p.values);
      return keyed(r, 1) as never;
    },
    optionsByQuestionIds: (ids) => rows(tx, `select ${OPT} from public.question_options o where o.question_id in ${uuidSet(1)} order by o.question_id, o.sort_order`, [jsonList(ids)]),
    summaries: (ids) => rows(tx, `select ${Q} from public.questions q where q.id in ${uuidSet(1)} and ${pubWhere}`, [jsonList(ids)]),
    assetsByIds: (ids) => rows<AssetRow>(tx, `select ${ASSET} from public.question_assets a where a.id in ${uuidSet(1)}`, [jsonList(ids)]),
    papersByIds: (ids) => rows(tx, `select ${PAPER} from public.exam_papers p where p.id in ${uuidSet(1)}`, [jsonList(ids)]),
    paperBySlug: (slug) => one(tx, `select ${PAPER} from public.exam_papers p where p.slug=$1`, [slug]),
    completePapers: async (examId) => {
      const papers = await rows<PaperRow & { question_count: number }>(
        tx,
        `select ${PAPER}, count(*) filter (where q.publication_status='PUBLISHED')::int as question_count
           from public.exam_papers p join public.questions q on q.paper_id = p.id
          where p.exam_id = $1
          group by p.id
         having count(*) filter (where q.publication_status='PUBLISHED') > 0
            and count(*) filter (where q.answer_key is not null and q.publication_status<>'PUBLISHED') = 0
            -- A full paper: NTA drops a few questions (no key), never most of them. Papers whose keys are mostly
            -- missing (e.g. 1 of 89 published) are not offered as full papers.
            and count(*) filter (where q.publication_status='PUBLISHED') * 10 >= count(*) * 9
          order by p.exam_date desc nulls last, p.shift desc nulls last, p.slug`,
        [examId],
      );
      if (papers.length === 0) return [];
      const secs = await rows<{ paper_id: string; subject_id: string; n: number }>(
        tx,
        `select q.paper_id, q.subject_id, count(*)::int as n from public.questions q
          where q.paper_id in ${uuidSet(1)} and q.publication_status='PUBLISHED' and q.subject_id is not null
          group by q.paper_id, q.subject_id`,
        [jsonList(papers.map((x) => x.id))],
      );
      return papers.map((x) => ({
        ...x,
        question_count: num(x.question_count),
        sections: secs.filter((s) => s.paper_id === x.id).map((s) => ({ subject_id: s.subject_id, n: num(s.n) })),
      }));
    },
  };
}

function practiceRepo(tx: Tx): PracticeRepo {
  return {
    selectQuestionIds: async (c) => {
      const p = new Params();
      const w = [`q.publication_status='PUBLISHED'`, `q.exam_id=${p.add(c.examId)}`, 'q.chapter_id is not null', 'q.subject_id is not null', 'q.answer_key is not null'];
      // A full paper includes its paper-only questions (inactive "Not yet tagged" chapter); every other set leaves them out.
      if (c.mode !== 'PYQ_PAPER') w.push(`q.chapter_id in (select ch.id from public.chapters ch where ch.is_active)`);
      if (c.mode === 'SUBJECT' && c.subjectId) w.push(`q.subject_id=${p.add(c.subjectId)}`);
      if (c.mode === 'CHAPTER' && c.chapterId) w.push(`q.chapter_id=${p.add(c.chapterId)}`);
      if (c.mode === 'TOPIC' && c.topicId) w.push(`q.topic_id=${p.add(c.topicId)}`);
      if (c.mode === 'PYQ_PAPER' && c.paperId) w.push(`q.paper_id=${p.add(c.paperId)}`);
      if (c.mode === 'MISTAKES') w.push(`exists (select 1 from public.mistakes m where m.user_id=${p.add(c.userId)} and m.question_id=q.id and m.resolved_at is null)`);
      if (c.mode === 'BOOKMARKS') w.push(`exists (select 1 from public.bookmarks b where b.user_id=${p.add(c.userId)} and b.question_id=q.id)`);
      if (c.difficulty) w.push(`q.difficulty::text in ${textSet(p.next)}`, `${p.add(jsonList(c.difficulty))}::jsonb is not null`);
      if (c.types) w.push(`q.question_type::text in ${textSet(p.next)}`, `${p.add(jsonList(c.types))}::jsonb is not null`);
      if (c.yearFrom) w.push(`q.year >= ${p.add(c.yearFrom)}`);
      if (c.yearTo) w.push(`q.year <= ${p.add(c.yearTo)}`);
      if (!c.includePremium) w.push(`q.access_tier = 'FREE'`);
      if (c.excludeCorrect) w.push(`not exists (select 1 from public.attempts a where a.user_id=${p.add(c.userId)} and a.question_id=q.id and a.is_correct)`);
      const order = c.mode === 'PYQ_PAPER' ? `nullif(regexp_replace(q.question_number, '\\D', '', 'g'), '')::int nulls last, q.question_number, q.id` : 'random()';
      const r = await rows<{ id: string }>(tx, `select q.id from public.questions q where ${w.join(' and ')} order by ${order} limit ${p.add(c.size)}`, p.values);
      return r.map((x) => x.id);
    },
    findSessionByRequest: (u, rid) => one(tx, `select ${SESS} from public.practice_sessions s where s.user_id=$1 and s.client_request_id=$2`, [u, rid]),
    getSession: (u, id) => one(tx, `select ${SESS} from public.practice_sessions s where s.user_id=$1 and s.id=$2`, [u, id]),
    insertSession: async (s) => {
      const r = await rows<SessionRow>(
        tx,
        `insert into public.practice_sessions (user_id, client_request_id, mode, exam_id, subject_id, chapter_id, topic_id, paper_id, filters, question_ids, status, started_at, ui_mode, time_limit_sec)
         values ($1,$2,$3::public.practice_mode,$4,$5,$6,$7,$8,$9::jsonb, ${uuidArray(10)}, 'ACTIVE', $11, $12, $13)
         on conflict (user_id, client_request_id) do nothing
         returning ${SESS_RET}`,
        [s.user_id, s.client_request_id, s.mode, s.exam_id, s.subject_id, s.chapter_id, s.topic_id, s.paper_id, JSON.stringify(s.filters), jsonList(s.question_ids), s.started_at, s.ui_mode, s.time_limit_sec],
      );
      return r[0] ?? null;
    },
    abandonSession: (u, id) =>
      one(
        tx,
        `update public.practice_sessions set status='ABANDONED', last_activity_at=now() where user_id=$1 and id=$2 and status='ACTIVE'
         returning ${SESS_RET}`,
        [u, id],
      ),
    completeSession: (u, id) =>
      one(
        tx,
        `update public.practice_sessions set status='COMPLETED', completed_at=now(), last_activity_at=now() where user_id=$1 and id=$2 and status='ACTIVE'
         returning ${SESS_RET}`,
        [u, id],
      ),
    listSessions: async (u, statuses, after, limit) => {
      const p = new Params();
      const c = [`s.user_id=${p.add(u)}`];
      if (statuses) c.push(`s.status::text in ${textSet(p.next)}`, `${p.add(jsonList(statuses))}::jsonb is not null`);
      c.push(keysetWhere(p, after, ['s.last_activity_at'], 's.id', 'desc', ['timestamptz']));
      const r = await rows<Record<string, unknown>>(tx, `select ${SESS}, s.last_activity_at::text as _k0 from public.practice_sessions s where ${c.join(' and ')} order by s.last_activity_at desc, s.id desc limit ${p.add(limit)}`, p.values);
      return keyed(r, 1) as never;
    },
    attemptsForSession: (u, sid) => rows(tx, `select ${ATT} from public.attempts a where a.user_id=$1 and a.session_id=$2 order by a.submitted_at`, [u, sid]),
    findAttempt: (u, cid) => one(tx, `select ${ATT} from public.attempts a where a.user_id=$1 and a.client_attempt_id=$2`, [u, cid]),
    findAttemptForSessionQuestion: (sid, qid) => one(tx, `select ${ATT} from public.attempts a where a.session_id=$1 and a.question_id=$2`, [sid, qid]),
    insertAttempt: async (a) =>
      one<AttemptRow>(
        tx,
        `insert into public.attempts (user_id, question_id, session_id, client_attempt_id, request_hash, response, is_correct, score, time_spent_ms, submitted_at)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::numeric,$9,$10)
         on conflict do nothing
         returning id, user_id, question_id, session_id, client_attempt_id, request_hash, response, is_correct, score::text as score, time_spent_ms, activity_date::text as activity_date, submitted_at`,
        [a.user_id, a.question_id, a.session_id, a.client_attempt_id, a.request_hash, JSON.stringify(a.response), a.is_correct, a.score, a.time_spent_ms, a.submitted_at],
      ),
  };
}
const uuidArray = (n: number): string => `array(select value::uuid from jsonb_array_elements_text($${n}::jsonb))`;

function studentServiceRepo(tx: Tx): StudentServiceRepo {
  return {
    getStreak: async (u) => {
      const r = await one<{ current_streak: number; longest_streak: number; last_active_date: string | null; today: string; timezone: string }>(
        tx,
        `select g.current_streak, g.longest_streak, g.last_active_date::text as last_active_date, g.today::text as today,
                coalesce((select p.timezone from public.profiles p where p.id=$1), 'Asia/Kolkata') as timezone
         from app_private.get_streak($1) g`,
        [u],
      );
      if (!r) throw new Error('streak unavailable');
      return r;
    },
    last7Days: async (u, today) =>
      (await rows<{ activity_date: string; attempts_count: number; correct_count: number }>(
        tx,
        `select activity_date::text as activity_date, attempts_count, correct_count from public.daily_activity where user_id=$1 and activity_date between ($2::date - 6) and $2::date`,
        [u, today],
      )),
    rolesFor: async (u) => (await rows<{ role: 'ADMIN' | 'REVIEWER' }>(tx, `select role from public.user_roles where user_id=$1`, [u])).map((r) => r.role),
    countDoubtsSince: async (who, since) =>
      num((await one<{ n: number }>(tx, `select count(*)::int as n from public.doubts where created_at >= $1 and ${'userId' in who ? 'user_id=$2' : 'ip_hash=$2'}`, [since, 'userId' in who ? who.userId : who.ipHash]))?.n),
    insertDoubt: async (d) =>
      (await rows<never>(
        tx,
        `insert into public.doubts (user_id, question_id, body, upload_id, ip_hash) values ($1,$2,$3,$4,$5)
         returning id, user_id, question_id, body, upload_id, status, is_public, ip_hash, created_at`,
        [d.user_id, d.question_id, d.body, d.upload_id, d.ip_hash],
      ))[0]!,
    insertUpload: async (u) =>
      (await rows<never>(
        tx,
        `insert into public.user_uploads (id, user_id, purpose, bucket, r2_key, mime_type, bytes, sha256) values ($1,$2,$3::public.upload_purpose,'USER_UPLOADS',$4,$5,$6,$7)
         returning id, user_id, purpose, bucket, r2_key, mime_type, bytes, sha256, status, created_at`,
        [u.id, u.user_id, u.purpose, u.r2_key, u.mime_type, u.bytes, u.sha256],
      ))[0]!,
    getUpload: (u, id) => one(tx, `select id, user_id, purpose, bucket, r2_key, mime_type, bytes, sha256, status, created_at from public.user_uploads where id=$2 and user_id=$1`, [u, id]),
    uploadsByIds: (ids) => rows(tx, `select id, user_id, purpose, bucket, r2_key, mime_type, bytes, sha256, status, created_at from public.user_uploads where id in ${uuidSet(1)}`, [jsonList(ids)]),
    getProfile: (id) => one(tx, `select ${PROFILE} from public.profiles p where p.id=$1`, [id]),
  };
}

export function userRepo(tx: Tx): UserRepo {
  return {
    getProfile: (id) => one(tx, `select ${PROFILE} from public.profiles p where p.id=$1`, [id]),
    updateProfile: async (id, patch) => {
      const p = new Params();
      const sets: string[] = [];
      const { onboarding_completed, ...rest } = patch;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) sets.push(`${k}=${p.add(v)}`);
      if (onboarding_completed) sets.push('onboarding_completed_at=now()');
      if (sets.length) await tx.query(`update public.profiles set ${sets.join(', ')} where id=${p.add(id)}`, p.values);
      return one(tx, `select ${PROFILE} from public.profiles p where p.id=$1`, [id]);
    },
    listPrefs: (id) => rows(tx, `select exam_id, is_primary, target_year from public.user_exam_preferences where user_id=$1 order by created_at, exam_id`, [id]),
    replacePrefs: async (id, prefs) => {
      await tx.query(`delete from public.user_exam_preferences where user_id=$1`, [id]);
      for (const p of prefs) await tx.query(`insert into public.user_exam_preferences (user_id, exam_id, is_primary, target_year) values ($1,$2,$3,$4)`, [id, p.exam_id, p.is_primary, p.target_year]);
      return rows(tx, `select exam_id, is_primary, target_year from public.user_exam_preferences where user_id=$1 order by created_at, exam_id`, [id]);
    },
    listBookmarks: async (id, after, limit) => {
      const p = new Params();
      const c = [`b.user_id=${p.add(id)}`, keysetWhere(p, after, ['b.created_at'], 'b.question_id', 'desc', ['timestamptz'])];
      const r = await rows<Record<string, unknown>>(tx, `select b.question_id, b.note, b.created_at, b.created_at::text as _k0 from public.bookmarks b where ${c.join(' and ')} order by b.created_at desc, b.question_id desc limit ${p.add(limit)}`, p.values);
      return keyed(r, 1, 'question_id') as never;
    },
    upsertBookmark: async (id, qid, note) => {
      const r = await one<{ question_id: string; note: string | null; created_at: Date; created: boolean }>(
        tx,
        `insert into public.bookmarks (user_id, question_id, note) values ($1,$2,$3)
         on conflict (user_id, question_id) do update set note = excluded.note
         returning question_id, note, created_at, (xmax = 0) as created`,
        [id, qid, note],
      );
      if (!r) throw new Error('bookmark upsert failed');
      return { created: r.created, row: { question_id: r.question_id, note: r.note, created_at: r.created_at } };
    },
    deleteBookmark: async (id, qid) => void (await tx.query(`delete from public.bookmarks where user_id=$1 and question_id=$2`, [id, qid])),
    listMistakes: async (id, f, after, limit) => {
      const p = new Params();
      const c = [`m.user_id=${p.add(id)}`];
      if (f.status === 'open') c.push('m.resolved_at is null');
      if (f.status === 'resolved') c.push('m.resolved_at is not null');
      if (f.subjectId) c.push(`m.subject_id=${p.add(f.subjectId)}`);
      if (f.chapterId) c.push(`m.chapter_id=${p.add(f.chapterId)}`);
      c.push(keysetWhere(p, after, ['m.last_wrong_at'], 'm.question_id', 'desc', ['timestamptz']));
      const r = await rows<Record<string, unknown>>(tx, `select m.question_id, m.subject_id, m.chapter_id, m.wrong_count, m.first_wrong_at, m.last_wrong_at, m.resolved_at, m.last_wrong_at::text as _k0 from public.mistakes m where ${c.join(' and ')} order by m.last_wrong_at desc, m.question_id desc limit ${p.add(limit)}`, p.values);
      return keyed(r, 1, 'question_id') as never;
    },
    deleteMistake: async (id, qid) => void (await tx.query(`delete from public.mistakes where user_id=$1 and question_id=$2`, [id, qid])),
    chapterStats: async (id, examId) =>
      (await rows<{ chapter_id: string; subject_id: string; exam_id: string; attempts_count: number; correct_count: number; total_time_ms: number; last_attempt_at: Date }>(
        tx,
        `select chapter_id, subject_id, exam_id, attempts_count, correct_count, total_time_ms::float8 as total_time_ms, last_attempt_at from public.user_chapter_stats where user_id=$1 and exam_id=$2`,
        [id, examId],
      )),
    listAttempts: async (id, f, after, limit) => {
      const p = new Params();
      const c = [`a.user_id=${p.add(id)}`];
      if (f.questionId) c.push(`a.question_id=${p.add(f.questionId)}`);
      if (f.sessionId) c.push(`a.session_id=${p.add(f.sessionId)}`);
      c.push(keysetWhere(p, after, ['a.submitted_at'], 'a.id', 'desc', ['timestamptz']));
      const r = await rows<Record<string, unknown>>(tx, `select ${ATT}, a.submitted_at::text as _k0 from public.attempts a where ${c.join(' and ')} order by a.submitted_at desc, a.id desc limit ${p.add(limit)}`, p.values);
      return keyed(r, 1) as never;
    },
    listActivity: async (id, from, to) =>
      (await rows<{ activity_date: string; attempts_count: number; correct_count: number; total_time_ms: number }>(
        tx,
        `select activity_date::text as activity_date, attempts_count, correct_count, total_time_ms::float8 as total_time_ms from public.daily_activity where user_id=$1 and activity_date between $2::date and $3::date order by activity_date`,
        [id, from, to],
      )).map((r) => ({ ...r, attempts_count: num(r.attempts_count), correct_count: num(r.correct_count), total_time_ms: num(r.total_time_ms) })),
    listDoubts: async (id, after, limit) => {
      const p = new Params();
      const c = [`d.user_id=${p.add(id)}`, keysetWhere(p, after, ['d.created_at'], 'd.id', 'desc', ['timestamptz'])];
      const r = await rows<Record<string, unknown>>(tx, `select d.id, d.user_id, d.question_id, d.body, d.upload_id, d.status, d.is_public, d.ip_hash, d.created_at, d.created_at::text as _k0 from public.doubts d where ${c.join(' and ')} order by d.created_at desc, d.id desc limit ${p.add(limit)}`, p.values);
      return keyed(r, 1) as never;
    },
  };
}

const PATCH_CASTS: Record<keyof QuestionPatch, string> = {
  slug: 'text',
  structured_content: 'jsonb',
  question_text: 'text',
  question_type: 'public.question_type',
  answer_key: 'jsonb',
  answer_key_source: 'public.answer_key_source',
  marks: 'numeric',
  negative_marks: 'numeric',
  difficulty: 'public.difficulty',
  subject_id: 'uuid',
  chapter_id: 'uuid',
  topic_id: 'uuid',
  seo_title: 'text',
  seo_description: 'text',
  indexability: 'public.indexability',
  sitemap_include: 'boolean',
  verification_status: 'public.verification_status',
  publication_status: 'public.publication_status',
  current_solution_id: 'uuid',
  ingestion_status: 'public.ingestion_status',
};
const JSON_COLS = new Set(['structured_content', 'answer_key']);

function adminRepo(tx: Tx): AdminRepo {
  const getQ = (id: string) => one<QuestionRow>(tx, `select ${Q} from public.questions q where q.id=$1`, [id]);
  const getJob = (id: string) => one<JobRow>(tx, `select ${JOB} from public.pipeline_jobs j where j.id=$1`, [id]);
  return {
    listQuestions: async (f, after, limit) => {
      const p = new Params();
      const c: string[] = [];
      if (f.verification) c.push(`q.verification_status::text in ${textSet(p.next)}`, `${p.add(jsonList(f.verification))}::jsonb is not null`);
      if (f.publication) c.push(`q.publication_status::text in ${textSet(p.next)}`, `${p.add(jsonList(f.publication))}::jsonb is not null`);
      if (f.ingestion) c.push(`q.ingestion_status::text in ${textSet(p.next)}`, `${p.add(jsonList(f.ingestion))}::jsonb is not null`);
      if (f.examId) c.push(`q.exam_id::text=${p.add(f.examId)}`);
      if (f.subjectId) c.push(`q.subject_id::text=${p.add(f.subjectId)}`);
      if (f.chapterId) c.push(`q.chapter_id::text=${p.add(f.chapterId)}`);
      if (f.origin) c.push(`q.origin=${p.add(f.origin)}::public.question_origin`);
      if (f.q) c.push(`(q.search_tsv @@ websearch_to_tsquery('english', ${p.add(f.q)}) or q.slug ilike '%' || ${p.add(f.q)} || '%')`);
      c.push(keysetWhere(p, after, ['q.updated_at'], 'q.id', 'desc', ['timestamptz']));
      const r = await rows<Record<string, unknown>>(tx, `select ${Q}, q.updated_at::text as _k0 from public.questions q where ${c.join(' and ')} order by q.updated_at desc, q.id desc limit ${p.add(limit)}`, p.values);
      return keyed(r, 1) as never;
    },
    getQuestion: getQ,
    optionsFor: (id) => rows(tx, `select ${OPT} from public.question_options o where o.question_id=$1 order by o.sort_order`, [id]),
    solutionVersions: (id) => rows(tx, `select ${SOL} from public.solution_versions s where s.question_id=$1 order by s.version desc`, [id]),
    getSolution: (id) => one(tx, `select ${SOL} from public.solution_versions s where s.id=$1`, [id]),
    getSource: (id) => one(tx, `select ${SRC} from public.sources s where s.id=$1`, [id]),
    sourceByIdMap: (ids) => rows(tx, `select ${SRC} from public.sources s where s.id in ${uuidSet(1)}`, [jsonList(ids)]),
    paperById: (id) => one(tx, `select ${PAPER} from public.exam_papers p where p.id=$1`, [id]),
    updateQuestion: async (id, expected, patch, opts) => {
      const p = new Params();
      const sets: string[] = [];
      for (const [k, v] of Object.entries(patch) as [keyof QuestionPatch, unknown][]) {
        if (v === undefined) continue;
        const val = JSON_COLS.has(k) && v !== null ? JSON.stringify(v) : v;
        sets.push(`${k}=${p.add(val)}::${PATCH_CASTS[k]}`);
      }
      if (opts?.allowSlugChange) await tx.query(`select set_config('app.allow_slug_change','on',true)`);
      if (sets.length === 0) sets.push('row_version=row_version');
      const r = await rows<QuestionRow>(tx, `update public.questions set ${sets.join(', ')} where id=${p.add(id)} and row_version=${p.add(expected)} returning ${Q.replaceAll('q.', 'public.questions.')}`, p.values);
      if (r[0]) return r[0];
      return (await getQ(id)) ? 'CONFLICT' : null;
    },
    upsertOptionsByLabel: async (qid, opts) => {
      await tx.query(`delete from public.question_options where question_id=$1 and label not in ${textSet(2)}`, [qid, jsonList(opts.map((o) => o.label))]);
      for (const o of opts) {
        await tx.query(
          `insert into public.question_options (question_id, label, sort_order, content, content_text) values ($1,$2,$3,$4::jsonb,$5)
           on conflict (question_id, label) do update set sort_order=excluded.sort_order, content=excluded.content, content_text=excluded.content_text`,
          [qid, o.label, o.sort_order, JSON.stringify(o.content), o.content_text],
        );
      }
      return rows(tx, `select ${OPT} from public.question_options o where o.question_id=$1 order by o.sort_order`, [qid]);
    },
    insertSolution: async (n) =>
      (await rows<SolutionRow>(
        tx,
        `insert into public.solution_versions (question_id, final_answer, summary, steps, formulas, concepts, alternatives, shortcuts, common_mistakes, provenance, based_on_version_id, author_id, edit_note)
         values ($1,$2::jsonb,$3,$4::jsonb,$5::jsonb,${textArray(6)},$7::jsonb,$8::jsonb,$9::jsonb,$10::public.solution_provenance,$11,$12,$13)
         returning ${SOL.replaceAll('s.', 'public.solution_versions.')}`,
        [n.question_id, JSON.stringify(n.final_answer), n.summary, JSON.stringify(n.steps), JSON.stringify(n.formulas), jsonList(n.concepts), JSON.stringify(n.alternatives), JSON.stringify(n.shortcuts), JSON.stringify(n.common_mistakes), n.provenance, n.based_on_version_id, n.author_id, n.edit_note],
      ))[0]!,
    setSolutionReview: async (id, status, reviewer) => void (await tx.query(`update public.solution_versions set review_status=$2::public.solution_review_status, reviewed_by=$3, reviewed_at=now() where id=$1`, [id, status, reviewer])),
    supersedeApproved: async (qid, except) => void (await tx.query(`update public.solution_versions set review_status='SUPERSEDED' where question_id=$1 and id<>$2 and review_status='APPROVED'`, [qid, except])),
    assetsForQuestion: (qid) => rows(tx, `select ${ASSET} from public.question_assets a where a.question_id=$1`, [qid]),
    moveAssetToPublic: async (id, key) =>
      (
        await tx.query(
          `update public.question_assets set bucket='PUBLIC_ASSETS', r2_key=$2 where id=$1 and not exists (select 1 from public.question_assets x where x.bucket='PUBLIC_ASSETS' and x.r2_key=$2 and x.id<>$1) returning id`,
          [id, key],
        )
      ).rows.length > 0,
    insertReviewEvent: async (e) =>
      void (await tx.query(
        `insert into public.review_events (question_id, solution_version_id, actor_id, action, from_verification_status, to_verification_status, from_publication_status, to_publication_status, note)
         values ($1,$2,$3,$4::public.review_action,$5::public.verification_status,$6::public.verification_status,$7::public.publication_status,$8::public.publication_status,$9)`,
        [e.question_id, e.solution_version_id, e.actor_id, e.action, e.from_verification_status, e.to_verification_status, e.from_publication_status, e.to_publication_status, e.note],
      )),
    insertAudit: async (a) =>
      void (await tx.query(`insert into public.audit_log (actor_id, actor_type, action, entity_type, entity_id, request_id, ip_hash, details) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [a.actor_id, a.actor_type, a.action, a.entity_type, a.entity_id, a.request_id, a.ip_hash, JSON.stringify(a.details ?? null)])),
    enqueueJob: async (j) =>
      (await one<{ id: string }>(tx, `select app_private.enqueue_pipeline_job($1::public.job_kind,$2,$3::jsonb,$4,now(),$5,$6,$7) as id`, [j.kind, j.idempotency_key, JSON.stringify(j.payload), j.priority ?? 100, j.question_id ?? null, j.source_document_id ?? null, j.created_by]))!.id,
    verificationRuns: async (qid) => {
      const runs = await rows<never>(tx, `select id, question_id, solution_version_id, rules_version, outcome, resulting_status, reasons, started_at, finished_at from public.verification_runs where question_id=$1 order by started_at desc`, [qid]);
      const out = [];
      for (const run of runs as { id: string }[]) {
        const checks = await rows<never>(tx, `select verification_run_id, kind, result, details, ai_run_id from public.verification_checks where verification_run_id=$1 order by created_at`, [run.id]);
        out.push({ run, checks });
      }
      return out as never;
    },
    latestRuns: async (ids) => {
      const r = await rows<{ question_id: string }>(tx, `select distinct on (question_id) id, question_id, rules_version, outcome, resulting_status, reasons, started_at, finished_at from public.verification_runs where question_id in ${uuidSet(1)} order by question_id, started_at desc`, [jsonList(ids)]);
      return new Map(r.map((x) => [x.question_id, x as never]));
    },
    aiRuns: (qid) => rows(tx, `select id, question_id, task, provider, model, prompt_id, prompt_version, status, input_tokens, output_tokens, cost_usd_micros::float8 as cost_usd_micros, latency_ms, created_at from public.ai_runs where question_id=$1 order by created_at desc`, [qid]),
    reviewEvents: (qid) => rows(tx, `select id::float8 as id, question_id, solution_version_id, actor_id, action, from_verification_status, to_verification_status, from_publication_status, to_publication_status, note, created_at from public.review_events where question_id=$1 order by id desc`, [qid]),
    listSources: async (after, limit) => {
      const p = new Params();
      const c = [keysetWhere(p, after, ['s.code'], 's.id', 'asc', ['text'])];
      const r = await rows<Record<string, unknown>>(tx, `select ${SRC}, s.code as _k0 from public.sources s where ${c.join(' and ')} order by s.code, s.id limit ${p.add(limit)}`, p.values);
      return keyed(r, 1) as never;
    },
    insertSource: async (s) =>
      (await rows<SourceRow>(
        tx,
        `insert into public.sources (code, name, kind, publisher, homepage_url, license_name, license_url, reuse_permitted, attribution_text, notes) values ($1,$2,$3::public.source_kind,$4,$5,$6,$7,$8,$9,$10)
         returning ${SRC.replaceAll('s.', 'public.sources.')}`,
        [s.code, s.name, s.kind, s.publisher, s.homepage_url, s.license_name, s.license_url, false, s.attribution_text, s.notes],
      ))[0]!,
    approveSource: (id, approver, lic, note) =>
      one(tx, `update public.sources set reuse_permitted=true, license_name=$2, license_url=$3, approved_by=$4, approved_at=now(), notes=$5 where id=$1 returning ${SRC.replaceAll('s.', 'public.sources.')}`, [id, lic.name, lic.url, approver, note]),
    listDocuments: async (source, after, limit) => {
      const p = new Params();
      const c = [source ? `s.code=${p.add(source)}` : 'true', keysetWhere(p, after, ['d.created_at'], 'd.id', 'desc', ['timestamptz'])];
      const r = await rows<Record<string, unknown>>(
        tx,
        `select d.id, s.code as source_code, pp.slug as paper_slug, d.kind, d.original_filename, d.bytes::float8 as bytes, d.page_count, d.created_at, d.created_at::text as _k0,
           (select jsonb_build_object('id', j.id, 'status', j.status, 'attempts', j.attempts, 'last_error', j.last_error) from public.pipeline_jobs j where j.source_document_id=d.id order by j.created_at desc limit 1) as latest_job,
           (select coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) from (select sq.status::text as status, count(*)::int as n from public.source_questions sq where sq.source_document_id=d.id group by sq.status) x) as question_counts
         from public.source_documents d join public.sources s on s.id=d.source_id left join public.exam_papers pp on pp.id=d.paper_id
         where ${c.join(' and ')} order by d.created_at desc, d.id desc limit ${p.add(limit)}`,
        p.values,
      );
      return keyed(r, 1) as never;
    },
    listJobs: async (f, after, limit) => {
      const p = new Params();
      const c: string[] = [];
      if (f.status) c.push(`j.status::text in ${textSet(p.next)}`, `${p.add(jsonList(f.status))}::jsonb is not null`);
      if (f.kind) c.push(`j.kind::text in ${textSet(p.next)}`, `${p.add(jsonList(f.kind))}::jsonb is not null`);
      c.push(keysetWhere(p, after, ['j.created_at'], 'j.id', 'desc', ['timestamptz']));
      const r = await rows<Record<string, unknown>>(tx, `select ${JOB}, j.created_at::text as _k0 from public.pipeline_jobs j where ${c.join(' and ')} order by j.created_at desc, j.id desc limit ${p.add(limit)}`, p.values);
      return keyed(r, 1) as never;
    },
    getJob,
    findJobByKey: (k) => one<JobRow>(tx, `select ${JOB} from public.pipeline_jobs j where j.idempotency_key=$1`, [k]),
    jobEvents: (id, limit) => rows<JobEventRow>(tx, `select level, stage, message, data, created_at from public.pipeline_job_events where job_id=$1 order by id desc limit $2`, [id, limit]).then((r) => r.reverse()),
    retryJob: async (id) => {
      const r = await one<{ id: string }>(tx, `update public.pipeline_jobs set status='QUEUED', attempts=0, run_after=now(), locked_by=null, locked_at=null, lease_expires_at=null, finished_at=null, last_error=null where id=$1 and status in ('DEAD','CANCELLED') returning id`, [id]);
      return r ? getJob(id) : null;
    },
    cancelJob: async (id) => {
      const r = await one<{ id: string }>(tx, `update public.pipeline_jobs set status='CANCELLED', finished_at=now(), locked_by=null, locked_at=null, lease_expires_at=null where id=$1 and status in ('QUEUED','RUNNING') returning id`, [id]);
      return r ? getJob(id) : null;
    },
    listSourceQuestions: async (f, after, limit) => {
      const p = new Params();
      const c = [`sq.source_document_id=${p.add(f.documentId)}`];
      if (f.status) c.push(`sq.status=${p.add(f.status)}::public.source_question_status`);
      c.push(keysetWhere(p, after, [`lpad(sq.question_number, 8, '0')`], 'sq.id', 'asc', ['text']));
      const r = await rows<Record<string, unknown>>(tx, `select sq.id, sq.question_number, sq.status, sq.warnings, sq.extraction_method, sq.ocr_mean_confidence::float8 as ocr_mean_confidence, sq.duplicate_of_question_id, sq.possible_duplicate_of, sq.duplicate_similarity::float8 as duplicate_similarity, sq.promoted_question_id, lpad(sq.question_number, 8, '0') as _k0 from public.source_questions sq where ${c.join(' and ')} order by lpad(sq.question_number, 8, '0'), sq.id limit ${p.add(limit)}`, p.values);
      return keyed(r, 1) as never;
    },
    getSourceQuestion: (id) => one(tx, `select sq.id, sq.question_number, sq.status, sq.warnings, sq.extraction_method, sq.ocr_mean_confidence::float8 as ocr_mean_confidence, sq.duplicate_of_question_id, sq.possible_duplicate_of, sq.duplicate_similarity::float8 as duplicate_similarity, sq.promoted_question_id from public.source_questions sq where sq.id=$1`, [id]),
    promoteSourceQuestion: async (id, examId, subject) => (await one<{ id: string }>(tx, `select app_private.promote_source_question($1,$2,$3) as id`, [id, examId, subject]))!.id,
    rejectSourceQuestion: async (id) => void (await tx.query(`update public.source_questions set status='REJECTED' where id=$1`, [id])),
  };
}

/** SQL store: one DB unit of work per call; user-scoped reads/writes run under RLS via `withUser`. */
export function createSqlStore(db: Db): Store {
  return {
    service: (fn) =>
      db.withService((tx) => {
        const repos: ServiceRepos = {
          taxonomy: taxonomyRepo(tx),
          content: contentRepo(tx),
          practice: practiceRepo(tx),
          students: studentServiceRepo(tx),
          admin: adminRepo(tx),
        };
        return fn(repos);
      }),
    user: (ctx, fn) => db.withUser(ctx.claims, (tx) => fn({ user: userRepo(tx) })),
    ping: () => db.withService(async (tx) => ((await tx.query('select 1 as ok')).rows.length === 1)),
  };
}
