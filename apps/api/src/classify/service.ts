/**
 * Admin question classification: browse the real question bank (any status), filter by exam / subject / chapter /
 * difficulty (incl. UNCLASSIFIED = NULL) / year / type, preview with the original crops, and set difficulty, chapter and
 * topic one by one or in bulk. Direct SQL on the service connection, same pattern as billing/ and problems/.
 *
 * Safety:
 *  - Reviewer or admin only (route guard; server-side).
 *  - Bulk updates run in one transaction with the rows locked; anything that would break a rule is skipped with a reason
 *    instead of failing the batch. The database triggers still have the last word (taxonomy consistency, the publication
 *    guard, row_version).
 *  - Never assigns a difficulty on its own: only the value the reviewer chose. Published questions can't go back to
 *    UNCLASSIFIED (the publication guard requires a difficulty) and their chapter is changed only in the question editor.
 *  - Every bulk write goes to audit_log with the ids and the change.
 */
import type { Db, SqlTx } from '@projectx/db';
import type {
  AnswerKey,
  BulkClassifyBody,
  BulkClassifyResult,
  ClassifyItem,
  ClassifyList,
  ClassifyPreview,
  ClassifyQuery,
  DifficultyFilter,
  PublicContentBlock,
} from '@projectx/contracts';
import { cacheTags, signFileUrl } from '@projectx/edge';
import type { AppDeps } from '../deps';
import { notFound, validation } from '../lib/errors';

type Tx = SqlTx;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREVIEW_TTL_SEC = 600;

class Params {
  values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

const FROM = `
  from public.questions q
  join public.exams e on e.id = q.exam_id
  left join public.subjects s on s.id = q.subject_id
  left join public.chapters c on c.id = q.chapter_id
  left join public.topics t on t.id = q.topic_id
  left join public.exam_papers p on p.id = q.paper_id`;

/** WHERE for the filters; `withDifficulty=false` builds the base for the per-difficulty counts. */
function where(f: ClassifyQuery, p: Params, withDifficulty: boolean): string {
  const w: string[] = ['true'];
  if (f.exam) w.push(`e.slug = ${p.add(f.exam)}`);
  if (f.subject) w.push(`s.slug = ${p.add(f.subject)}`);
  if (f.chapter === 'none') w.push('q.chapter_id is null');
  else if (f.chapter) w.push(`c.slug = ${p.add(f.chapter)}`);
  if (f.year !== undefined) w.push(`q.year = ${p.add(f.year)}`);
  if (f.question_type) w.push(`q.question_type::text = ${p.add(f.question_type)}`);
  if (f.publication_status) w.push(`q.publication_status::text = ${p.add(f.publication_status)}`);
  if (f.origin) w.push(`q.origin::text = ${p.add(f.origin)}`);
  if (f.q) {
    if (UUID_RE.test(f.q)) w.push(`q.id = ${p.add(f.q.toLowerCase())}::uuid`);
    else {
      const a = p.add(f.q);
      w.push(`(q.search_tsv @@ websearch_to_tsquery('english', ${a}) or q.slug ilike '%' || ${a} || '%')`);
    }
  }
  if (withDifficulty && f.difficulty?.length) {
    const named = f.difficulty.filter((d) => d !== 'UNCLASSIFIED');
    const parts: string[] = [];
    if (named.length) parts.push(`q.difficulty::text = any(${p.add(named)}::text[])`);
    if (f.difficulty.includes('UNCLASSIFIED')) parts.push('q.difficulty is null');
    w.push(`(${parts.join(' or ')})`);
  }
  return w.join(' and ');
}

interface ItemRow {
  id: string;
  slug: string;
  exam_slug: string;
  exam_name: string;
  subject_slug: string | null;
  subject_name: string | null;
  chapter_slug: string | null;
  chapter_name: string | null;
  topic_slug: string | null;
  topic_name: string | null;
  difficulty: ClassifyItem['difficulty'];
  difficulty_source: ClassifyItem['difficulty_source'];
  difficulty_set_at: string | Date | null;
  question_type: ClassifyItem['question_type'];
  origin: ClassifyItem['origin'];
  publication_status: ClassifyItem['publication_status'];
  verification_status: string;
  year: number | null;
  shift: number | null;
  question_number: string | null;
  paper_title: string | null;
  excerpt: string;
  has_answer_key: boolean;
  answer_key_source: string | null;
  row_version: number;
  updated_at: string | Date;
}

const iso = (v: string | Date | null): string | null => (v == null ? null : new Date(v).toISOString());

function toItem(r: ItemRow): ClassifyItem {
  const named = (slug: string | null, name: string | null) => (slug && name ? { slug, name } : null);
  return {
    id: r.id,
    slug: r.slug,
    exam: { slug: r.exam_slug, name: r.exam_name },
    subject: named(r.subject_slug, r.subject_name),
    chapter: named(r.chapter_slug, r.chapter_name),
    topic: named(r.topic_slug, r.topic_name),
    difficulty: r.difficulty,
    difficulty_source: r.difficulty_source,
    difficulty_set_at: iso(r.difficulty_set_at),
    question_type: r.question_type,
    origin: r.origin,
    publication_status: r.publication_status,
    verification_status: r.verification_status,
    year: r.year === null ? null : Number(r.year),
    shift: r.shift === null ? null : Number(r.shift),
    question_number: r.question_number,
    paper: r.paper_title,
    excerpt: r.excerpt,
    has_answer_key: r.has_answer_key,
    answer_key_source: r.answer_key_source,
    row_version: Number(r.row_version),
    updated_at: iso(r.updated_at)!,
  };
}

export async function list(db: Db, f: ClassifyQuery): Promise<ClassifyList> {
  return db.withService(async (tx) => {
    const p = new Params();
    const w = where(f, p, true);
    const limit = p.add(f.limit);
    const offset = p.add(f.offset);
    const items = await tx.query<ItemRow>(
      `select q.id, q.slug, e.slug as exam_slug, e.name as exam_name, s.slug as subject_slug, s.name as subject_name,
              c.slug as chapter_slug, c.name as chapter_name, t.slug as topic_slug, t.name as topic_name,
              q.difficulty::text as difficulty, q.difficulty_source, q.difficulty_set_at, q.question_type::text as question_type,
              q.origin::text as origin, q.publication_status::text as publication_status, q.verification_status::text as verification_status,
              q.year, q.shift, q.question_number, p.title as paper_title,
              left(regexp_replace(q.question_text, '\\s+', ' ', 'g'), 240) as excerpt,
              (q.answer_key is not null) as has_answer_key, q.answer_key_source::text as answer_key_source,
              q.row_version, q.updated_at
       ${FROM}
       where ${w}
       order by e.slug, q.year desc nulls last, p.title nulls last,
                (case when q.question_number ~ '^[0-9]{1,6}$' then q.question_number::int end) nulls last, q.question_number, q.id
       limit ${limit} offset ${offset}`,
      p.values,
    );
    const pc = new Params();
    const wc = where(f, pc, false);
    const counts = await tx.query<{ d: string | null; n: number }>(
      `select q.difficulty::text as d, count(*)::int as n ${FROM} where ${wc} group by 1`,
      pc.values,
    );
    const out = { EASY: 0, MEDIUM: 0, HARD: 0, UNCLASSIFIED: 0 };
    for (const r of counts.rows) out[(r.d ?? 'UNCLASSIFIED') as keyof typeof out] = Number(r.n);
    const wanted: DifficultyFilter[] = f.difficulty?.length ? f.difficulty : ['EASY', 'MEDIUM', 'HARD', 'UNCLASSIFIED'];
    const total = wanted.reduce<number>((a, d) => a + out[d], 0);
    return { items: items.rows.map(toItem), total, offset: f.offset, limit: f.limit, counts: out };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Bulk update
// ---------------------------------------------------------------------------------------------------------------------

interface LockRow {
  id: string;
  slug: string;
  exam_id: string;
  subject_id: string | null;
  chapter_id: string | null;
  topic_id: string | null;
  family_id: string | null;
  publication_status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  difficulty: string | null;
}

export interface Actor {
  id: string;
  isAdmin: boolean;
  requestId: string | null;
}

export async function bulk(d: Pick<AppDeps, 'db' | 'cache' | 'waitUntil' | 'logger'>, actor: Actor, b: BulkClassifyBody): Promise<BulkClassifyResult> {
  const ids = [...new Set(b.ids.map((x) => x.toLowerCase()))];
  const out = await d.db.withService(async (tx) => {
    let chapter: { id: string; subject_id: string } | null = null;
    if (b.chapter) {
      chapter = (await tx.query<{ id: string; subject_id: string }>(`select id, subject_id from public.chapters where slug=$1`, [b.chapter])).rows[0] ?? null;
      if (!chapter) throw validation('Unknown chapter', { reason: 'UNKNOWN_CHAPTER', chapter: b.chapter });
    }
    let topic: { id: string; chapter_id: string } | null = null;
    if (b.topic) {
      topic = (await tx.query<{ id: string; chapter_id: string }>(`select id, chapter_id from public.topics where slug=$1`, [b.topic])).rows[0] ?? null;
      if (!topic) throw validation('Unknown topic', { reason: 'UNKNOWN_TOPIC', topic: b.topic });
    }

    const rows = (
      await tx.query<LockRow>(
        `select id, slug, exam_id, subject_id, chapter_id, topic_id, family_id, publication_status::text as publication_status, difficulty::text as difficulty
           from public.questions where id = any($1::uuid[]) order by id for update`,
        [ids],
      )
    ).rows;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const skipped: { id: string; reason: string }[] = [];
    const ok: LockRow[] = [];
    for (const id of ids) {
      const q = byId.get(id);
      if (!q) {
        skipped.push({ id, reason: 'not found' });
        continue;
      }
      const published = q.publication_status === 'PUBLISHED';
      if (b.difficulty === 'UNCLASSIFIED' && published) {
        skipped.push({ id, reason: 'a published question must keep a difficulty' });
        continue;
      }
      if (chapter && chapter.id !== q.chapter_id) {
        if (published) {
          skipped.push({ id, reason: 'change the chapter of a published question in the question editor' });
          continue;
        }
        if (q.subject_id && chapter.subject_id !== q.subject_id) {
          skipped.push({ id, reason: 'chapter belongs to a different subject' });
          continue;
        }
      }
      const targetChapter = chapter?.id ?? q.chapter_id;
      if (topic && topic.chapter_id !== targetChapter) {
        skipped.push({ id, reason: 'topic is not in the question\'s chapter' });
        continue;
      }
      ok.push(q);
    }

    if (ok.length) {
      const p = new Params();
      const sets: string[] = [];
      if (b.difficulty !== undefined) {
        sets.push(`difficulty = ${b.difficulty === 'UNCLASSIFIED' ? 'null' : `${p.add(b.difficulty)}::public.difficulty`}`);
      }
      if (chapter) {
        sets.push(`chapter_id = ${p.add(chapter.id)}::uuid`);
        sets.push(`subject_id = coalesce(subject_id, ${p.add(chapter.subject_id)}::uuid)`);
        // A topic belongs to one chapter; moving chapter clears it unless a topic is given in the same request.
        if (b.topic === undefined) sets.push(`topic_id = case when chapter_id = ${p.add(chapter.id)}::uuid then topic_id else null end`);
      }
      if (b.topic !== undefined) sets.push(`topic_id = ${topic ? `${p.add(topic.id)}::uuid` : 'null'}`);
      // Provenance for the difficulty trigger (0026): transaction-local, so it only labels this update.
      await tx.query(`select set_config('app.difficulty_source', 'ADMIN', true), set_config('app.difficulty_set_by', $1, true)`, [actor.id]);
      if (sets.length === 0) sets.push('row_version = row_version');
      await tx.query(`update public.questions set ${sets.join(', ')} where id = any(${p.add(ok.map((q) => q.id))}::uuid[])`, p.values);

      // Family difficulty follows its members (same rule as migration 0022: most common, ties to the harder label).
      const fams = (await tx.query<{ family_id: string }>(`select distinct family_id from public.questions where id = any($1::uuid[]) and family_id is not null`, [ok.map((q) => q.id)])).rows.map((r) => r.family_id);
      if (fams.length) {
        await tx.query(
          `update public.question_families f set difficulty = x.difficulty
             from (select distinct on (family_id) family_id, difficulty
                     from (select family_id, difficulty, count(*) n from public.questions
                            where family_id = any($1::uuid[]) and difficulty is not null group by 1, 2) y
                    order by family_id, n desc, difficulty desc) x
            where f.id = x.family_id and f.difficulty is distinct from x.difficulty`,
          [fams],
        );
      }
      await tx.query(
        `insert into public.audit_log (actor_id, actor_type, action, entity_type, entity_id, request_id, details) values ($1,$2,'question.bulk_classify','question',null,$3,$4::jsonb)`,
        [
          actor.id,
          actor.isAdmin ? 'ADMIN' : 'USER',
          actor.requestId,
          JSON.stringify({ ids: ok.map((q) => q.id), difficulty: b.difficulty ?? null, chapter: b.chapter ?? null, topic: b.topic === undefined ? undefined : b.topic, note: b.note ?? null, skipped: skipped.length }),
        ],
      );
    }
    return { updated: ok.length, skipped, published: ok.filter((q) => q.publication_status === 'PUBLISHED') };
  });

  // Published rows changed: refresh cached public lists/pages (best effort, same tags as the admin service).
  if (out.published.length) {
    const tags = new Set<string>([cacheTags.qlist, cacheTags.search, cacheTags.sitemap]);
    for (const q of out.published) {
      tags.add(cacheTags.question(q.id));
      tags.add(cacheTags.questionSlug(q.slug));
      tags.add(cacheTags.exam(q.exam_id));
      if (q.subject_id) tags.add(cacheTags.subject(q.subject_id));
      if (q.chapter_id) tags.add(cacheTags.chapter(q.chapter_id));
    }
    d.waitUntil(
      d.cache
        .purgeTags([...tags])
        .then((r) => {
          if (!r.ok) d.logger.warn('cache purge failed', { error: r.error });
        })
        .catch((e: unknown) => d.logger.error('cache purge threw', { error: String(e) })),
    );
  }
  return { updated: out.updated, skipped: out.skipped };
}

// ---------------------------------------------------------------------------------------------------------------------
// Preview (original crops through short-lived signed URLs)
// ---------------------------------------------------------------------------------------------------------------------

type RawBlock = { type: string; asset_id?: string; alt?: string; caption?: string } & Record<string, unknown>;
interface AssetRow {
  id: string;
  bucket: 'SOURCE_DOCS' | 'PUBLIC_ASSETS';
  r2_key: string;
  width: number | null;
  height: number | null;
}

export async function preview(
  d: Pick<AppDeps, 'db' | 'config' | 'clock'>,
  id: string,
): Promise<ClassifyPreview> {
  return d.db.withService(async (tx) => {
    const q = (
      await tx.query<{ id: string; structured_content: RawBlock[]; answer_key: AnswerKey | null; answer_key_source: string | null; sols: number }>(
        `select q.id, q.structured_content, q.answer_key, q.answer_key_source::text as answer_key_source,
                (select count(*)::int from public.solution_versions s where s.question_id = q.id) as sols
           from public.questions q where q.id = $1`,
        [id],
      )
    ).rows[0];
    if (!q) throw notFound('Question');
    const opts = (
      await tx.query<{ id: string; label: 'A' | 'B' | 'C' | 'D' | 'E'; content: RawBlock[] }>(
        `select id, label, content from public.question_options where question_id = $1 order by sort_order`,
        [id],
      )
    ).rows;
    const ids = new Set<string>();
    for (const b of [...q.structured_content, ...opts.flatMap((o) => o.content)]) if (b.type === 'image' && b.asset_id) ids.add(b.asset_id);
    const assets = ids.size
      ? (await tx.query<AssetRow>(`select id, bucket::text as bucket, r2_key, width, height from public.question_assets where id = any($1::uuid[])`, [[...ids]])).rows
      : [];
    const byId = new Map(assets.map((a) => [a.id, a]));
    const urlFor = async (a: AssetRow): Promise<string> => {
      if (a.bucket === 'PUBLIC_ASSETS') return `${d.config.PUBLIC_ASSETS_BASE_URL.replace(/\/+$/, '')}/${a.r2_key}`;
      return signFileUrl({
        secret: d.config.SIGNING_SECRET,
        baseUrl: `${d.config.FILES_BASE_URL.replace(/\/+$/, '')}/preview`,
        bucket: 'SOURCE_DOCS',
        key: a.r2_key,
        expiresInSec: PREVIEW_TTL_SEC,
        now: d.clock().getTime(),
      });
    };
    const blocks = async (raw: RawBlock[]): Promise<PublicContentBlock[]> => {
      const res: PublicContentBlock[] = [];
      for (const b of raw) {
        if (b.type !== 'image') {
          res.push(b as unknown as PublicContentBlock);
          continue;
        }
        const a = b.asset_id ? byId.get(b.asset_id) : undefined;
        if (!a) {
          res.push({ type: 'paragraph', text: `[missing image ${b.asset_id ?? ''}]` });
          continue;
        }
        res.push({
          type: 'image',
          asset_id: a.id,
          alt: String(b.alt ?? '').slice(0, 300),
          ...(b.caption ? { caption: String(b.caption).slice(0, 500) } : {}),
          url: await urlFor(a),
          width: a.width === null ? null : Number(a.width),
          height: a.height === null ? null : Number(a.height),
        });
      }
      return res;
    };
    const correct =
      q.answer_key && q.answer_key.type !== 'NUMERICAL' ? opts.filter((o) => (q.answer_key as { correct_option_ids: string[] }).correct_option_ids.includes(o.id)).map((o) => o.label) : [];
    return {
      id: q.id,
      content: await blocks(q.structured_content),
      options: await Promise.all(opts.map(async (o) => ({ label: o.label, content: await blocks(o.content) }))),
      answer_key: q.answer_key,
      answer_key_source: q.answer_key_source,
      correct_labels: correct,
      solution_versions: Number(q.sols),
    };
  });
}
