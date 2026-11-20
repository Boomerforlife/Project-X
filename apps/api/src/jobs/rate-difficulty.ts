/**
 * Cloud Run Job: rate difficulty from students' first attempts (src/content/difficulty-stats.ts). No AI.
 * Touches only PUBLISHED questions whose difficulty is null or was set by this job before (difficulty_source = 'STATS');
 * admin / AI / import ratings are never changed. Writes declare themselves with app.difficulty_source = 'STATS', so the
 * provenance trigger (0026/0027) records it. Purges the web cache once when anything changed.
 *
 *   RATE_DRY_RUN   "true" = report only (default true; a real run must opt in)
 */
import { createPostgresDb } from '@projectx/db/postgres';
import { createNoopInvalidator, createWebhookInvalidator } from '@projectx/edge';
import { parseConfig } from '../config';
import { chapterPrior, rateDifficulty, type Difficulty } from '../content/difficulty-stats';
import { createConsoleLogger } from '../deps';

const config = parseConfig(process.env);
if (config.DB_DRIVER !== 'postgres' || !config.DATABASE_URL) throw new Error('rate-difficulty requires DB_DRIVER=postgres and DATABASE_URL');
const dryRun = process.env['RATE_DRY_RUN'] !== 'false';
const logger = createConsoleLogger(config.LOG_LEVEL);
const db = createPostgresDb({ url: config.DATABASE_URL, max: 2 });

type Row = { id: string; chapter_id: string | null; difficulty: Difficulty | null; source: string | null; n: number; k: number };
const rows = await db.withService(async (tx) =>
  (
    await tx.query<Row>(
      `with firsts as (
         select distinct on (a.user_id, a.question_id) a.question_id, a.is_correct
           from public.attempts a order by a.user_id, a.question_id, a.submitted_at
       ), per_q as (
         select question_id, count(*)::int as n, (count(*) filter (where is_correct))::int as k from firsts group by 1
       )
       select q.id, q.chapter_id, q.difficulty::text as difficulty, q.difficulty_source as source,
              coalesce(p.n, 0) as n, coalesce(p.k, 0) as k
         from public.questions q left join per_q p on p.question_id = q.id
        where q.publication_status = 'PUBLISHED'`,
    )
  ).rows,
);

// Chapter priors pool every published question of the chapter (including admin-rated ones: they are real attempts too).
const pool = new Map<string, { n: number; k: number }>();
for (const r of rows) {
  if (!r.chapter_id) continue;
  const p = pool.get(r.chapter_id) ?? { n: 0, k: 0 };
  p.n += Number(r.n);
  p.k += Number(r.k);
  pool.set(r.chapter_id, p);
}

const changes: { id: string; to: Difficulty }[] = [];
let eligible = 0;
for (const r of rows) {
  if (!(r.difficulty === null || r.source === 'STATS')) continue;
  eligible++;
  const c = r.chapter_id ? pool.get(r.chapter_id) : undefined;
  const prior = chapterPrior(c?.n ?? 0, c?.k ?? 0);
  const current = r.source === 'STATS' ? r.difficulty : null;
  const next = rateDifficulty({ n: Number(r.n), k: Number(r.k), prior, current });
  if (next && next !== r.difficulty) changes.push({ id: r.id, to: next });
}

if (!dryRun && changes.length) {
  for (let i = 0; i < changes.length; i += 200) {
    const chunk = changes.slice(i, i + 200);
    await db.withService(async (tx) => {
      await tx.query(`select set_config('app.difficulty_source', 'STATS', true)`);
      for (const c of chunk) {
        await tx.query(
          `update public.questions set difficulty = $2::public.difficulty
            where id = $1 and publication_status = 'PUBLISHED' and (difficulty is null or difficulty_source = 'STATS')`,
          [c.id, c.to],
        );
      }
    });
  }
  const cache =
    config.WEB_REVALIDATE_URL && config.WEB_REVALIDATE_SECRET
      ? createWebhookInvalidator({ url: config.WEB_REVALIDATE_URL, secret: config.WEB_REVALIDATE_SECRET })
      : createNoopInvalidator();
  const res = await cache.purgeTags(['web']);
  if (!res.ok) logger.warn('cache purge failed', { error: res.error });
}

const byLabel = changes.reduce<Record<string, number>>((m, c) => ((m[c.to] = (m[c.to] ?? 0) + 1), m), {});
logger.info('rate-difficulty done', { published: rows.length, eligible, changed: changes.length, by_label: byLabel, dry_run: dryRun });
await db.close?.();
process.exit(0);
