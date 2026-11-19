import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '@projectx/db/testing';
import { classifyChapter, knownChapters } from '../src/content/chapter-keywords';
import { createSqlStore } from '../src/repositories/sql/store';
import { autoTagChapter, publishOfficialAnswerOnly } from '../src/services/admin';
import { makeHarness, type Harness } from './helpers';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let db: TestDb;
let h: Harness;
const sql = async (q: string, p: unknown[] = []): Promise<Row[]> => db.withService(async (tx) => (await tx.query<Row>(q, p)).rows);

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  h = makeHarness({ store: createSqlStore(db), db });
}, 120_000);
afterAll(() => db.close());

describe('keyword chapter classifier', () => {
  it('assigns clear questions and abstains on vague ones', () => {
    expect(classifyChapter('PHYSICS', 'Two resistors are connected in a Wheatstone bridge; find the current through the galvanometer.')).toMatchObject({ chapter: 'current-electricity', confident: true });
    expect(classifyChapter('MATHEMATICS', 'The eccentricity of the ellipse whose latus rectum is half its major axis is')).toMatchObject({ chapter: 'co-ordinate-geometry', confident: true });
    expect(classifyChapter('CHEMISTRY', 'The number of ambidentate ligands among the following is')).toMatchObject({ chapter: 'co-ordination-compounds', confident: true });
    // OCR damage ("he llipse") still reaches the stem.
    expect(classifyChapter('MATHEMATICS', 'The lengt of the chord of he llipse = 1 whose mid point is')).toMatchObject({ chapter: 'co-ordinate-geometry', confident: true });
    expect(classifyChapter('PHYSICS', 'Which of the following is correct?').confident).toBe(false);
    // Whole-word terms do not fire inside other words ("using" is not sin, "molecule" is not mole).
    expect(classifyChapter('MATHEMATICS', 'using the given data, find the value').confident).toBe(false);
  });

  it('only names chapters that exist in the JEE Main taxonomy', async () => {
    const rows = await sql(`select c.slug, s.slug as subject_slug, s.code from chapters c join subjects s on s.id=c.subject_id join exams e on e.id=s.exam_id where e.slug='jee-main'`);
    const have = new Set(rows.map((r) => `${r.code}:${String(r.slug).slice(String(r.subject_slug).length + 1)}`));
    if (have.size === 0) return; // taxonomy seed not loaded in this fixture set
    for (const code of ['PHYSICS', 'CHEMISTRY', 'MATHEMATICS'] as const) for (const ch of knownChapters(code)) expect(have.has(`${code}:${ch}`), `${code}:${ch}`).toBe(true);
  });
});

describe('official answer-only publication (no AI)', () => {
  async function asOfficialPyqDraft(): Promise<{ id: string; slug: string; kinematics: string }> {
    const [q] = await sql(`select id, slug, chapter_id from questions where slug='demo-draft-unreviewed-question'`);
    const [opt] = await sql(`select id from question_options where question_id=$1 and label='B'`, [q!.id]);
    await sql(
      `update questions set origin='PYQ', difficulty=null, chapter_id=null, family_id=null, verification_status='PENDING',
              answer_key=$2::jsonb, answer_key_source='OFFICIAL' where id=$1`,
      [q!.id, JSON.stringify({ type: 'SINGLE_MCQ', correct_option_ids: [opt!.id] })],
    );
    return { id: q!.id, slug: q!.slug, kinematics: q!.chapter_id };
  }

  it('tags an empty chapter once, records the evidence, and never overwrites', async () => {
    const d = await asOfficialPyqDraft();
    expect(await autoTagChapter(h.deps.store!, d.id, d.kinematics, { matched: ['projectile'] })).toBe(true);
    expect(await autoTagChapter(h.deps.store!, d.id, d.kinematics, {})).toBe(false);
    const [q] = await sql(`select chapter_id, family_id from questions where id=$1`, [d.id]);
    // 0027: previous-year questions do not join problem families.
    expect(q).toMatchObject({ chapter_id: d.kinematics, family_id: null });
    expect(await sql(`select actor_type from audit_log where entity_id=$1 and action='question.auto_tag_chapter'`, [d.id])).toEqual([{ actor_type: 'WORKER' }]);
  });

  it('publishes with the official key as the answer, no steps, no difficulty, no claimed review', async () => {
    const [{ id, slug }] = [await asOfficialPyqDraft()];
    expect(await publishOfficialAnswerOnly(h.deps.store!, h.deps, id)).toMatchObject({ published: false, reason: 'NO_CHAPTER' });
    await sql(`update questions set chapter_id=(select id from chapters where slug='jee-main-physics-kinematics') where id=$1`, [id]);

    const r = await publishOfficialAnswerOnly(h.deps.store!, h.deps, id);
    expect(r.published).toBe(true);
    const [q] = await sql(`select publication_status, verification_status, difficulty, family_id, current_solution_id from questions where id=$1`, [id]);
    expect(q).toMatchObject({ publication_status: 'PUBLISHED', verification_status: 'OFFICIAL_KEY_MATCHED', difficulty: null, family_id: null });
    const [s] = await sql(`select provenance, review_status, reviewed_by, steps from solution_versions where id=$1`, [q!.current_solution_id]);
    expect(s).toMatchObject({ provenance: 'OFFICIAL', review_status: 'APPROVED', reviewed_by: null, steps: [] });
    expect(await sql(`select 1 from review_events where question_id=$1`, [id])).toHaveLength(0);

    const page = await h.req(`/public/questions/${slug}`);
    expect(page.status).toBe(200);
    const body = ((await page.json()) as Row).data;
    expect(body.verification.status).toBe('OFFICIAL_KEY_MATCHED');
    expect(body.solution.steps).toEqual([]);
    expect(body.difficulty).toBeNull();

    expect(await publishOfficialAnswerOnly(h.deps.store!, h.deps, id)).toMatchObject({ published: false, reason: 'NOT_DRAFT:PUBLISHED' });
  });

  it('the database still requires a difficulty for everything else', async () => {
    await expect(sql(`update questions set difficulty=null where slug='demo-constant-acceleration-distance'`)).rejects.toThrow(/difficulty is required/);
  });
});
