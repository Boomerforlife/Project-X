/**
 * Cloud Run Job: publish previous-year questions with OFFICIAL answer keys, without AI (owner decision 2026-11-20,
 * docs/CONTENT_SOURCES.md §3). Same image, env and secrets as the API service.
 *
 *   PYQ_STEP      tag | publish | both (default both)
 *   PYQ_EXAM      exam slug (default jee-main; the classifier only knows JEE Main chapters)
 *   PYQ_LIMIT     max questions per step (default 300)
 *   PYQ_DRY_RUN   "true" = report what would happen, change nothing (default true: a real run must opt in)
 *   PYQ_PAPER_ONLY "true" = an unconfident draft that belongs to a paper goes to its subject's hidden "Not yet tagged"
 *                 chapter (migration 0028): published for full papers only, never listed on chapter pages or in
 *                 ordinary practice. A person can move it to its real chapter later (admin questions page).
 *
 * tag:     PENDING drafts with an OFFICIAL key and no chapter get one from the keyword classifier, only when it is
 *          confident (src/content/chapter-keywords.ts). Unconfident ones stay for a person (admin questions page).
 * publish: PENDING drafts with an OFFICIAL key and a chapter are published answer-only (publishOfficialAnswerOnly).
 * Each question is its own transaction. Web caches are purged once at the end.
 */
import { Storage } from '@google-cloud/storage';
import { createPostgresDb } from '@projectx/db/postgres';
import { createNoopInvalidator, createWebhookInvalidator, type StorageSet } from '@projectx/edge';
import { createGcsStorage } from '@projectx/edge/node';
import { parseConfig } from '../config';
import { classifyChapter, type SubjectCode } from '../content/chapter-keywords';
import { createConsoleLogger } from '../deps';
import { createSqlStore } from '../repositories/sql/store';
import { autoTagChapter, publishOfficialAnswerOnly } from '../services/admin';

const config = parseConfig(process.env);
if (config.DB_DRIVER !== 'postgres' || !config.DATABASE_URL) throw new Error('pyq-official requires DB_DRIVER=postgres and DATABASE_URL');
if (config.STORAGE_DRIVER !== 'gcs') throw new Error('pyq-official requires STORAGE_DRIVER=gcs (images are copied to the public bucket)');

const step = process.env['PYQ_STEP'] ?? 'both';
const exam = process.env['PYQ_EXAM'] || 'jee-main';
const limit = Math.max(1, Math.min(5_000, Number(process.env['PYQ_LIMIT'] ?? 300)));
const dryRun = process.env['PYQ_DRY_RUN'] !== 'false';
const paperOnly = process.env['PYQ_PAPER_ONLY'] === 'true';
const UNTAGGED = 'not-yet-tagged';

const logger = createConsoleLogger(config.LOG_LEVEL);
const db = createPostgresDb({ url: config.DATABASE_URL, max: 2 });
const store = createSqlStore(db);
const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => db.withService(async (tx) => (await tx.query<T>(sql, params)).rows);

if (step === 'tag' || step === 'both') {
  const chapters = await q<{ id: string; slug: string; subject_slug: string; code: SubjectCode }>(
    `select c.id, c.slug, s.slug as subject_slug, s.code from public.chapters c join public.subjects s on s.id = c.subject_id
       join public.exams e on e.id = s.exam_id where e.slug = $1`,
    [exam],
  );
  const chapterId = new Map(chapters.map((c) => [`${c.code}:${c.slug.slice(c.subject_slug.length + 1)}`, c.id]));
  const drafts = await q<{ id: string; code: SubjectCode; text: string | null; paper_id: string | null }>(
    `select q.id, s.code, q.question_text as text, q.paper_id from public.questions q join public.subjects s on s.id = q.subject_id
       join public.exams e on e.id = q.exam_id
      where e.slug = $1 and q.publication_status = 'DRAFT' and q.verification_status = 'PENDING' and q.origin = 'PYQ'
        and q.answer_key_source = 'OFFICIAL' and q.chapter_id is null
      order by q.year, q.id limit $2`,
    [exam, limit],
  );
  let tagged = 0;
  let unsure = 0;
  let unknown = 0;
  let paperOnlyTagged = 0;
  for (const d of drafts) {
    const g = classifyChapter(d.code, d.text ?? '');
    if (!g.confident || !g.chapter) {
      const hidden = paperOnly && d.paper_id ? chapterId.get(`${d.code}:${UNTAGGED}`) : undefined;
      if (!hidden) {
        unsure++;
        continue;
      }
      if (dryRun || (await autoTagChapter(store, d.id, hidden, { paper_only: true, best_guess: g.chapter, score: g.score, runner_up: g.runnerUp, runner_up_score: g.runnerUpScore }))) {
        paperOnlyTagged++;
      }
      continue;
    }
    const cid = chapterId.get(`${d.code}:${g.chapter}`);
    if (!cid) {
      unknown++;
      continue;
    }
    if (dryRun) {
      tagged++;
      continue;
    }
    const ok = await autoTagChapter(store, d.id, cid, { chapter: g.chapter, score: g.score, runner_up: g.runnerUp, runner_up_score: g.runnerUpScore, matched: g.matched });
    if (ok) tagged++;
  }
  logger.info('pyq-official tag', { exam, scanned: drafts.length, tagged, paper_only: paperOnlyTagged, left_for_review: unsure, unknown_chapter: unknown, dry_run: dryRun });
}

if (step === 'publish' || step === 'both') {
  const gcs = new Storage();
  const storage: StorageSet = {
    SOURCE_DOCS: createGcsStorage(gcs.bucket(config.GCS_BUCKET_SOURCE_DOCS!)),
    PUBLIC_ASSETS: createGcsStorage(gcs.bucket(config.GCS_BUCKET_PUBLIC_ASSETS!)),
    USER_UPLOADS: createGcsStorage(gcs.bucket(config.GCS_BUCKET_USER_UPLOADS!)),
  };
  const cache =
    config.WEB_REVALIDATE_URL && config.WEB_REVALIDATE_SECRET
      ? createWebhookInvalidator({ url: config.WEB_REVALIDATE_URL, secret: config.WEB_REVALIDATE_SECRET })
      : createNoopInvalidator();
  const ids = (
    await q<{ id: string }>(
      `select q.id from public.questions q join public.exams e on e.id = q.exam_id
        where e.slug = $1 and q.publication_status = 'DRAFT' and q.verification_status = 'PENDING' and q.origin = 'PYQ'
          and q.answer_key_source = 'OFFICIAL' and q.chapter_id is not null
        order by q.year desc, q.id limit $2`,
      [exam, limit],
    )
  ).map((r) => r.id);
  const reasons = new Map<string, number>();
  const tags = new Set<string>();
  let published = 0;
  if (!dryRun) {
    for (const id of ids) {
      const r = await publishOfficialAnswerOnly(store, { storage, logger }, id);
      if (r.published) {
        published++;
        for (const t of r.tags) tags.add(t);
      } else {
        const k = r.reason.split(':')[0]!;
        reasons.set(k, (reasons.get(k) ?? 0) + 1);
        logger.warn('pyq-official publish skipped', { question_id: id, reason: r.reason });
      }
    }
    const all = [...tags];
    for (let i = 0; i < all.length; i += 200) {
      const res = await cache.purgeTags(all.slice(i, i + 200));
      if (!res.ok) logger.warn('cache purge failed', { error: res.error });
    }
  }
  logger.info('pyq-official publish', { exam, candidates: ids.length, published, skipped: Object.fromEntries(reasons), dry_run: dryRun });
}

await db.close?.();
process.exit(0);
