import type { Db, SqlTx } from '@projectx/db';
import type { Problem, ProblemListQuery } from '@projectx/contracts';
import { ApiError } from '../lib/errors';
import { premiumRequired } from './access';

/** Acceptance is shown only once enough students have tried, so one lucky solve can't read as "100%". */
export const MIN_ATTEMPTERS_FOR_ACCEPTANCE = 5;

interface Row {
  id: string;
  number: number;
  title: string;
  difficulty: Problem['difficulty'];
  subject_slug: string;
  subject_name: string;
  chapter_slug: string;
  chapter_name: string;
  question_type: Problem['question_type'];
  variants: string | number;
  attempters: number;
  solvers: number;
  access_tier: 'FREE' | 'PREMIUM';
  solved_at: string | Date | null;
  tried: boolean;
  variants_tried?: string | number | null;
  total?: string | number;
}

class Params {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

const BASE = (viewer: string) => `
  from public.question_families f
  join public.exams e on e.id = f.exam_id
  join public.subjects s on s.id = f.subject_id
  join public.chapters c on c.id = f.chapter_id
  join lateral (
    select count(*) as variants, min(q.question_type::text) as question_type
      from public.questions q
     where q.family_id = f.id and q.publication_status = 'PUBLISHED' and q.answer_key is not null
  ) v on v.variants > 0
  left join public.user_family_status u on u.family_id = f.id and u.user_id = ${viewer}`;

const COLS = `f.id, f.number, f.title, f.difficulty::text as difficulty, s.slug as subject_slug, s.name as subject_name,
  c.slug as chapter_slug, c.name as chapter_name, v.question_type, v.variants, f.attempters, f.solvers,
  f.access_tier::text as access_tier, u.solved_at, (u.family_id is not null) as tried`;

function toProblem(r: Row, plus: boolean): Problem {
  const attempters = Number(r.attempters);
  return {
    number: Number(r.number),
    title: r.title,
    difficulty: r.difficulty,
    subject: { slug: r.subject_slug, name: r.subject_name },
    chapter: { slug: r.chapter_slug, name: r.chapter_name },
    question_type: r.question_type,
    variants: Number(r.variants),
    acceptance_rate: attempters >= MIN_ATTEMPTERS_FOR_ACCEPTANCE ? Math.round((Number(r.solvers) / attempters) * 1000) / 1000 : null,
    attempters,
    solvers: Number(r.solvers),
    premium: r.access_tier === 'PREMIUM',
    locked: r.access_tier === 'PREMIUM' && !plus,
    status: r.solved_at ? 'SOLVED' : r.tried ? 'ATTEMPTED' : null,
  };
}

export async function listProblems(
  db: Db,
  viewerId: string | null,
  plus: boolean,
  q: ProblemListQuery,
): Promise<{ items: Problem[]; total: number; offset: number; limit: number }> {
  if (q.status && !viewerId) throw new ApiError('UNAUTHENTICATED', 'Sign in to filter by your progress');
  return db.withService(async (tx) => {
    const p = new Params();
    const viewer = p.add(viewerId);
    const w = [`e.slug = ${p.add(q.exam)}`, 'e.is_active'];
    if (q.subject) w.push(`s.slug = ${p.add(q.subject)}`);
    if (q.chapter) w.push(`c.slug = ${p.add(q.chapter)}`);
    if (q.difficulty?.length) w.push(`f.difficulty::text in (select jsonb_array_elements_text(${p.add(JSON.stringify(q.difficulty))}::jsonb))`);
    if (q.premium) w.push(`f.access_tier = ${p.add(q.premium === 'true' ? 'PREMIUM' : 'FREE')}::public.access_tier`);
    if (q.q) w.push(`f.title ilike ${p.add(`%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`)}`);
    if (q.status === 'SOLVED') w.push('u.solved_at is not null');
    if (q.status === 'ATTEMPTED') w.push('u.family_id is not null and u.solved_at is null');
    if (q.status === 'TODO') w.push('u.family_id is null');
    const dir = q.order === 'desc' ? 'desc' : 'asc';
    const order =
      q.sort === 'acceptance'
        ? `(case when f.attempters >= ${MIN_ATTEMPTERS_FOR_ACCEPTANCE} then f.solvers::float / f.attempters end) ${dir} nulls last, f.number`
        : q.sort === 'difficulty'
          ? `f.difficulty ${dir} nulls last, f.number`
          : `f.number ${dir}`;
    const sql = `select ${COLS}, count(*) over () as total ${BASE(viewer)} where ${w.join(' and ')}
                  order by ${order} offset ${p.add(q.offset)} limit ${p.add(q.limit)}`;
    const { rows } = await tx.query<Row>(sql, p.values);
    const total = rows[0] ? Number(rows[0].total) : await countOnly(tx, w, p, viewer);
    return { items: rows.map((r) => toProblem(r, plus)), total, offset: q.offset, limit: q.limit };
  });
}

/** Total for an offset past the end (window count needs at least one row). */
async function countOnly(tx: SqlTx, w: string[], p: Params, viewer: string): Promise<number> {
  const vals = p.values.slice(0, -2);
  const { rows } = await tx.query<{ n: string }>(`select count(*)::text as n ${BASE(viewer)} where ${w.join(' and ')}`, vals);
  return Number(rows[0]?.n ?? 0);
}

async function familyByNumber(tx: SqlTx, number: number, viewerId: string | null): Promise<Row | null> {
  const { rows } = await tx.query<Row>(
    `select ${COLS},
            (select count(distinct a.question_id) from public.attempts a join public.questions q2 on q2.id = a.question_id
              where a.user_id = $1 and q2.family_id = f.id) as variants_tried
       ${BASE('$1')} where f.number = $2 and e.is_active`,
    [viewerId, number],
  );
  return rows[0] ?? null;
}

export async function getProblem(db: Db, viewerId: string | null, plus: boolean, number: number, freeVariants: number) {
  return db.withService(async (tx) => {
    const r = await familyByNumber(tx, number, viewerId);
    if (!r) throw new ApiError('NOT_FOUND', 'Problem not found');
    const tried = viewerId ? Number(r.variants_tried ?? 0) : null;
    return {
      ...toProblem(r, plus),
      variants_tried: tried,
      variants_left_free: viewerId && !plus ? Math.max(0, Math.min(Number(r.variants), freeVariants) - (tried ?? 0)) : null,
      solved_at: r.solved_at ? new Date(r.solved_at).toISOString() : null,
    };
  });
}

/**
 * Pick the variant to serve next: an untried one, else one never answered correctly, else any (random within a tier).
 * Free users get at most `freeVariants` distinct variants per problem; past that they re-practise the ones they've seen.
 */
export async function nextVariantId(db: Db, userId: string, plus: boolean, number: number, freeVariants: number): Promise<string> {
  return db.withService(async (tx) => {
    const fam = await familyByNumber(tx, number, userId);
    if (!fam) throw new ApiError('NOT_FOUND', 'Problem not found');
    if (fam.access_tier === 'PREMIUM' && !plus) throw premiumRequired('This problem is part of Tabby Plus', { number });
    const { rows } = await tx.query<{ id: string; tried: boolean; correct: boolean }>(
      `select q.id,
              exists (select 1 from public.attempts a where a.user_id = $2 and a.question_id = q.id) as tried,
              exists (select 1 from public.attempts a where a.user_id = $2 and a.question_id = q.id and a.is_correct) as correct
         from public.questions q
        where q.family_id = $1 and q.publication_status = 'PUBLISHED' and q.answer_key is not null
        order by random()`,
      [fam.id, userId],
    );
    if (rows.length === 0) throw new ApiError('NOT_FOUND', 'Problem not found');
    const tried = rows.filter((r) => r.tried);
    const untried = rows.filter((r) => !r.tried);
    const canTryNew = plus || tried.length < freeVariants;
    const pick = (canTryNew ? untried[0] : undefined) ?? tried.find((r) => !r.correct) ?? tried[0] ?? untried[0];
    return pick!.id;
  });
}

/** Today's date in India (the product's default timezone) as YYYY-MM-DD. */
export function istDate(now: Date): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Problem of the day: deterministic for the date, FREE problems only, the same for everyone. */
export async function dailyProblem(db: Db, exam: string, now: Date): Promise<{ date: string; problem: Problem } | null> {
  const date = istDate(now);
  return db.withService(async (tx) => {
    const { rows } = await tx.query<Row>(
      `select ${COLS} ${BASE('null::uuid')} where e.slug = $1 and e.is_active and f.access_tier = 'FREE'
        order by md5($2 || f.id::text) limit 1`,
      [exam, date],
    );
    return rows[0] ? { date, problem: { ...toProblem(rows[0], false), status: null } } : null;
  });
}

export async function summary(db: Db, viewerId: string | null, plus: boolean, exam: string, freeVariants: number) {
  return db.withService(async (tx) => {
    const { rows } = await tx.query<{ difficulty: string | null; n: string; solved: string; tried: string }>(
      `select f.difficulty::text as difficulty, count(*)::text as n,
              count(u.solved_at)::text as solved, count(u.family_id)::text as tried
         ${BASE('$1')} where e.slug = $2 and e.is_active
        group by f.difficulty`,
      [viewerId, exam],
    );
    const zero = () => ({ EASY: 0, MEDIUM: 0, HARD: 0, total: 0 });
    const problems = zero();
    const solved = zero();
    let attempted = 0;
    for (const r of rows) {
      const k = (r.difficulty ?? 'MEDIUM') as 'EASY' | 'MEDIUM' | 'HARD';
      problems[k] += Number(r.n);
      problems.total += Number(r.n);
      solved[k] += Number(r.solved);
      solved.total += Number(r.solved);
      attempted += Number(r.tried);
    }
    return {
      problems,
      solved: viewerId ? solved : null,
      attempted: viewerId ? attempted : null,
      plus,
      free_variants_per_problem: freeVariants,
    };
  });
}
