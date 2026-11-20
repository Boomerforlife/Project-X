/**
 * Cloud Run Job: give every JEE Main question without a real chapter one, with Claude + the keyword rules
 * (owner decision 2026-11-20; logic in src/content/chapter-ai.ts). Same image and env as the API, plus the secret
 * ANTHROPIC_API_KEY. Uses the Message Batches API (half price, results within 24 h).
 *
 *   CLASSIFY_STEP     submit | collect           submit: send one batch and log its id; collect: apply a finished batch
 *   CLASSIFY_BATCH_ID msgbatch_...               required for collect
 *   CLASSIFY_EXAM     exam slug (default jee-main)
 *   CLASSIFY_LIMIT    max questions to submit (default 50: run a small pilot first, then raise it)
 *   CLASSIFY_DRY_RUN  "true" = submit: print the first request and the count, send nothing; collect: decide, change nothing
 *
 * Candidates: questions of the exam with a subject and no real chapter (none, or the hidden "Not yet tagged" chapter
 * from migration 0028), any publication status. A question moves only out of those two states, never between real
 * chapters. Questions left for review stay where they are (admin questions page, chapter filter "Not yet tagged").
 */
import Anthropic from '@anthropic-ai/sdk';
import { createPostgresDb } from '@projectx/db/postgres';
import { cacheTags, createNoopInvalidator, createWebhookInvalidator } from '@projectx/edge';
import { parseConfig } from '../config';
import { classifyChapter, type SubjectCode } from '../content/chapter-keywords';
import { buildRequest, decide, outputSchema, parseAnswer, systemPrompt, type ChapterOption } from '../content/chapter-ai';
import { createConsoleLogger } from '../deps';

const config = parseConfig(process.env);
if (config.DB_DRIVER !== 'postgres' || !config.DATABASE_URL) throw new Error('classify-chapters requires DB_DRIVER=postgres and DATABASE_URL');
if (!process.env['ANTHROPIC_API_KEY']) throw new Error('classify-chapters requires the ANTHROPIC_API_KEY secret');

const step = process.env['CLASSIFY_STEP'] ?? 'submit';
const exam = process.env['CLASSIFY_EXAM'] || 'jee-main';
const limit = Math.max(1, Math.min(100_000, Number(process.env['CLASSIFY_LIMIT'] ?? 50)));
const dryRun = process.env['CLASSIFY_DRY_RUN'] === 'true';
const UNTAGGED = 'not-yet-tagged';

const logger = createConsoleLogger(config.LOG_LEVEL);
const db = createPostgresDb({ url: config.DATABASE_URL, max: 2 });
const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => db.withService(async (tx) => (await tx.query<T>(sql, params)).rows);
const client = new Anthropic();

type Subject = { id: string; slug: string; name: string; code: SubjectCode; chapters: (ChapterOption & { id: string })[] };
const subjectRows = await q<{ id: string; slug: string; name: string; code: SubjectCode; ch_id: string; segment: string; ch_name: string }>(
  `select s.id, s.slug, s.name, s.code, c.id as ch_id, c.segment, c.name as ch_name
     from public.subjects s join public.exams e on e.id = s.exam_id join public.chapters c on c.subject_id = s.id
    where e.slug = $1 and c.is_active order by s.sort_order, c.sort_order`,
  [exam],
);
const subjects = new Map<string, Subject>();
for (const r of subjectRows) {
  const s = subjects.get(r.id) ?? { id: r.id, slug: r.slug, name: r.name, code: r.code, chapters: [] };
  s.chapters.push({ id: r.ch_id, segment: r.segment, name: r.ch_name });
  subjects.set(r.id, s);
}
if (subjects.size === 0) throw new Error(`no active chapters for exam ${exam}`);

const CANDIDATES = `from public.questions q join public.exams e on e.id = q.exam_id
  left join public.chapters c on c.id = q.chapter_id
 where e.slug = $1 and q.subject_id is not null and (q.chapter_id is null or c.segment = '${UNTAGGED}')`;

if (step === 'submit') {
  const rows = await q<{ id: string; subject_id: string; text: string; image: string | null }>(
    `select q.id, q.subject_id, q.question_text as text,
            (select a.r2_key from public.question_assets a
              where a.id = (q.structured_content -> 0 ->> 'asset_id')::uuid and a.bucket = 'PUBLIC_ASSETS') as image
       ${CANDIDATES} order by q.year desc, q.id limit $2`,
    [exam, limit],
  );
  const base = config.PUBLIC_ASSETS_BASE_URL.replace(/\/+$/, '');
  const requests = rows.flatMap((r) => {
    const s = subjects.get(r.subject_id);
    if (!s) return [];
    return [buildRequest({ id: r.id, text: r.text, imageUrl: r.image ? `${base}/${r.image}` : null }, systemPrompt('JEE Main', s.name, s.chapters), outputSchema(s.chapters))];
  });
  if (dryRun || requests.length === 0) {
    logger.info('classify-chapters submit (dry run)', { exam, candidates: rows.length, requests: requests.length, first: requests[0] ?? null });
  } else {
    const batch = await client.messages.batches.create({ requests });
    logger.info('classify-chapters submitted', { exam, requests: requests.length, batch_id: batch.id, status: batch.processing_status });
  }
} else if (step === 'collect') {
  const batchId = process.env['CLASSIFY_BATCH_ID'];
  if (!batchId) throw new Error('CLASSIFY_BATCH_ID is required for collect');
  const batch = await client.messages.batches.retrieve(batchId);
  if (batch.processing_status !== 'ended') {
    logger.info('classify-chapters batch not finished', { batch_id: batchId, status: batch.processing_status, counts: batch.request_counts });
  } else {
    const info = new Map(
      (await q<{ id: string; subject_id: string; text: string; status: string }>(`select q.id, q.subject_id, q.question_text as text, q.publication_status::text as status ${CANDIDATES}`, [exam])).map(
        (r) => [r.id, r],
      ),
    );
    let assigned = 0;
    let review = 0;
    let skipped = 0;
    const usage = { input: 0, output: 0, cache_read: 0 };
    const reasons = new Map<string, number>();
    const tags = new Set<string>([cacheTags.qlist, cacheTags.taxonomy, cacheTags.sitemap, cacheTags.search]);
    for await (const res of await client.messages.batches.results(batchId)) {
      const row = info.get(res.custom_id);
      const s = row ? subjects.get(row.subject_id) : undefined;
      if (!row || !s) {
        skipped++; // already moved by a person or an earlier collect
        continue;
      }
      const msg = res.result.type === 'succeeded' ? res.result.message : null;
      if (msg) {
        usage.input += msg.usage.input_tokens;
        usage.output += msg.usage.output_tokens;
        usage.cache_read += msg.usage.cache_read_input_tokens ?? 0;
      }
      const known = new Set(s.chapters.map((c) => c.segment));
      const ai = msg ? parseAnswer(msg, known) : null;
      const kwRaw = classifyChapter(s.code, row.text ?? '');
      const d = decide(ai, kwRaw);
      if (d.action === 'review') {
        review++;
        const k = d.why.split(' ')[0] ?? d.why;
        reasons.set(k, (reasons.get(k) ?? 0) + 1);
        continue;
      }
      const ch = s.chapters.find((c) => c.segment === d.chapter)!;
      if (dryRun) {
        assigned++;
        continue;
      }
      const moved = await db.withService(async (tx) => {
        const r = await tx.query<{ id: string }>(
          `update public.questions q set chapter_id = $2, topic_id = null
            where q.id = $1 and (q.chapter_id is null or q.chapter_id in (select c.id from public.chapters c where c.segment = '${UNTAGGED}'))
          returning q.id`,
          [res.custom_id, ch.id],
        );
        if (r.rows.length === 0) return false;
        await tx.query(
          `insert into public.audit_log (actor_id, actor_type, action, entity_type, entity_id, request_id, ip_hash, details)
           values (null, 'WORKER', 'question.ai_tag_chapter', 'question', $1, null, null, $2::jsonb)`,
          [res.custom_id, JSON.stringify({ chapter_id: ch.id, chapter: d.chapter, why: d.why, model: msg?.model ?? null, confidence: ai?.confidence ?? null, keywords: kwRaw.chapter, keyword_score: kwRaw.score, batch_id: batchId })],
        );
        return true;
      });
      if (moved) {
        assigned++;
        if (row.status === 'PUBLISHED') {
          tags.add(cacheTags.question(res.custom_id));
          tags.add(cacheTags.chapter(ch.id));
          tags.add(cacheTags.subject(s.id));
        }
      }
    }
    if (!dryRun) {
      const cache =
        config.WEB_REVALIDATE_URL && config.WEB_REVALIDATE_SECRET
          ? createWebhookInvalidator({ url: config.WEB_REVALIDATE_URL, secret: config.WEB_REVALIDATE_SECRET })
          : createNoopInvalidator();
      const all = [...tags];
      for (let i = 0; i < all.length; i += 200) {
        const r = await cache.purgeTags(all.slice(i, i + 200));
        if (!r.ok) logger.warn('cache purge failed', { error: r.error });
      }
    }
    logger.info('classify-chapters collected', { batch_id: batchId, assigned, review, skipped, review_reasons: Object.fromEntries(reasons), usage, dry_run: dryRun });
  }
} else {
  throw new Error(`unknown CLASSIFY_STEP ${step}`);
}

await db.close?.();
process.exit(0);
