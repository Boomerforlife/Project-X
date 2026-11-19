/**
 * Cloud Run Job: publish previous-year questions whose AI solution matches the official answer key.
 * Same image, env and secrets as the API service. Owner decision 2026-11-20 (docs/CONTENT_SOURCES.md §3).
 *
 *   PUBLISH_LIMIT     max questions this run (default 500)
 *   PUBLISH_EXAM      optional exam slug filter (e.g. jee-main)
 *   PUBLISH_DRY_RUN   "true" = count and list candidates, change nothing
 *
 * Each question is its own transaction (autoPublishOfficialMatch); a refusal or error leaves that question untouched.
 * Web caches are purged once at the end through the revalidation webhook.
 */
import { Storage } from '@google-cloud/storage';
import { createPostgresDb } from '@projectx/db/postgres';
import { createNoopInvalidator, createWebhookInvalidator, type StorageSet } from '@projectx/edge';
import { createGcsStorage } from '@projectx/edge/node';
import { parseConfig } from '../config';
import { createConsoleLogger } from '../deps';
import { createSqlStore } from '../repositories/sql/store';
import { autoPublishOfficialMatch } from '../services/admin';

const config = parseConfig(process.env);
if (config.DB_DRIVER !== 'postgres' || !config.DATABASE_URL) throw new Error('publish-official requires DB_DRIVER=postgres and DATABASE_URL');
if (config.STORAGE_DRIVER !== 'gcs') throw new Error('publish-official requires STORAGE_DRIVER=gcs (images are copied to the public bucket)');

const limit = Math.max(1, Math.min(10_000, Number(process.env['PUBLISH_LIMIT'] ?? 500)));
const exam = process.env['PUBLISH_EXAM'] || null;
const dryRun = process.env['PUBLISH_DRY_RUN'] === 'true';

const logger = createConsoleLogger(config.LOG_LEVEL);
const db = createPostgresDb({ url: config.DATABASE_URL, max: 2 });
const store = createSqlStore(db);
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

const candidates = await db.withService(async (tx) =>
  (
    await tx.query<{ id: string }>(
      `select q.id from public.questions q join public.exams e on e.id = q.exam_id
        where q.publication_status = 'DRAFT' and q.verification_status = 'OFFICIAL_KEY_MATCHED' and q.answer_key_source = 'OFFICIAL'
          and ($1::text is null or e.slug = $1)
        order by e.slug, q.year, q.id limit $2`,
      [exam, limit],
    )
  ).rows.map((r) => r.id),
);
logger.info('publish-official candidates', { count: candidates.length, exam, limit, dry_run: dryRun });

const reasons = new Map<string, number>();
const tags = new Set<string>();
let published = 0;
if (!dryRun) {
  for (const id of candidates) {
    const r = await autoPublishOfficialMatch(store, { storage, logger }, id);
    if (r.published) {
      published++;
      for (const t of r.tags) tags.add(t);
    } else {
      const k = r.reason.split(':')[0]!;
      reasons.set(k, (reasons.get(k) ?? 0) + 1);
      logger.warn('publish-official skipped', { question_id: id, reason: r.reason });
    }
  }
  // Purge in chunks (the web route accepts up to 200 tags per call). "web" alone would also work but is heavier.
  const all = [...tags];
  for (let i = 0; i < all.length; i += 200) {
    const res = await cache.purgeTags(all.slice(i, i + 200));
    if (!res.ok) logger.warn('cache purge failed', { error: res.error });
  }
}
logger.info('publish-official done', { candidates: candidates.length, published, skipped: Object.fromEntries(reasons), dry_run: dryRun });
await db.close?.();
process.exit(0);
