import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '@projectx/db/testing';
import { createSqlStore } from '../src/repositories/sql/store';
import { autoPublishOfficialMatch } from '../src/services/admin';
import { makeHarness, type Harness } from './helpers';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let db: TestDb;
let h: Harness;
const sql = async (q: string, p: unknown[] = []): Promise<Row[]> => db.withService(async (tx) => (await tx.query<Row>(q, p)).rows);

/**
 * Turns the fixture draft into "AI pipeline finished": official key on option `keyLabel`, an AI solution answering
 * `solLabel`, and a verification run with the given outcome / status that checked that solution.
 */
async function prepare(keyLabel: string, solLabel: string, run: { outcome: string; status: string }) {
  const [q] = await sql(`select id from questions where slug='demo-draft-unreviewed-question'`);
  const id = q!.id as string;
  const opts = await sql(`select id, label from question_options where question_id=$1`, [id]);
  const opt = (l: string) => opts.find((o) => o.label === l)!.id as string;
  const key = { type: 'SINGLE_MCQ', correct_option_ids: [opt(keyLabel)] };
  await sql(
    `update questions set difficulty='MEDIUM', answer_key=$2::jsonb, answer_key_source='OFFICIAL', verification_status=$3::verification_status where id=$1`,
    [id, JSON.stringify(key), run.status],
  );
  const [src] = await sql(`select summary, steps from solution_versions where id=(select current_solution_id from questions where slug='demo-constant-acceleration-distance')`);
  const [sol] = await sql(
    `insert into solution_versions (question_id, version, final_answer, summary, steps, provenance)
     values ($1, coalesce((select max(version) from solution_versions where question_id=$1), 0) + 1, $2::jsonb, $3, $4::jsonb, 'AI_GENERATED') returning id`,
    [id, JSON.stringify({ type: 'SINGLE_MCQ', correct_option_ids: [opt(solLabel)] }), src!.summary, JSON.stringify(src!.steps)],
  );
  await sql(
    `insert into verification_runs (question_id, solution_version_id, rules_version, outcome, resulting_status, finished_at)
     values ($1, $2, 'v1', $3::verification_outcome, $4::verification_status, now())`,
    [id, sol!.id, run.outcome, run.status],
  );
  return { id, solId: sol!.id as string };
}

beforeAll(async () => {
  db = await createTestDb({ fixtures: true });
  h = makeHarness({ store: createSqlStore(db), db });
}, 120_000);
afterAll(() => db.close());

describe('autoPublishOfficialMatch (worker publish of official-key-matched PYQs)', () => {
  it('refuses when the latest run did not pass as an official-key match; nothing changes', async () => {
    const { id, solId } = await prepare('B', 'B', { outcome: 'NEEDS_REVIEW', status: 'OFFICIAL_KEY_MATCHED' });
    const r = await autoPublishOfficialMatch(h.deps.store!, h.deps, id);
    expect(r).toMatchObject({ published: false, reason: 'LATEST_RUN_NOT_OFFICIAL_MATCH' });
    const [q] = await sql(`select publication_status, current_solution_id from questions where id=$1`, [id]);
    expect(q).toMatchObject({ publication_status: 'DRAFT', current_solution_id: null });
    expect((await sql(`select review_status from solution_versions where id=$1`, [solId]))[0]!.review_status).toBe('PENDING');
  });

  it('refuses when the AI answer differs from the official key', async () => {
    const { id } = await prepare('B', 'C', { outcome: 'PASSED', status: 'OFFICIAL_KEY_MATCHED' });
    expect(await autoPublishOfficialMatch(h.deps.store!, h.deps, id)).toMatchObject({ published: false, reason: 'KEY_MISMATCH' });
    expect((await sql(`select publication_status from questions where id=$1`, [id]))[0]!.publication_status).toBe('DRAFT');
  });

  it('publishes a matched question without claiming a human review, and it gets a public page', async () => {
    const { id, solId } = await prepare('B', 'B', { outcome: 'PASSED', status: 'OFFICIAL_KEY_MATCHED' });
    const r = await autoPublishOfficialMatch(h.deps.store!, h.deps, id);
    expect(r.published).toBe(true);

    const [q] = await sql(`select publication_status, verification_status, current_solution_id, answer_key_source, slug from questions where id=$1`, [id]);
    expect(q).toMatchObject({ publication_status: 'PUBLISHED', verification_status: 'OFFICIAL_KEY_MATCHED', current_solution_id: solId, answer_key_source: 'OFFICIAL' });
    const [s] = await sql(`select review_status, reviewed_by from solution_versions where id=$1`, [solId]);
    expect(s).toMatchObject({ review_status: 'APPROVED', reviewed_by: null });
    const audit = await sql(`select actor_type, actor_id from audit_log where entity_id=$1 and action='question.auto_publish_official_match'`, [id]);
    expect(audit).toEqual([{ actor_type: 'WORKER', actor_id: null }]);
    expect(await sql(`select 1 from review_events where question_id=$1 and action='PUBLISH'`, [id])).toHaveLength(0);

    const page = await h.req(`/public/questions/${q!.slug}`);
    expect(page.status).toBe(200);
    expect(((await page.json()) as Row).data.verification.status).toBe('OFFICIAL_KEY_MATCHED');
    const list = ((await (await h.req('/public/chapters/jee-main-physics-kinematics?limit=50')).json()) as Row).data.questions as Row[];
    expect(list.find((x) => x.id === id)?.public_page).toBe(true);

    // Idempotent: a second run is a no-op.
    expect(await autoPublishOfficialMatch(h.deps.store!, h.deps, id)).toMatchObject({ published: false, reason: 'NOT_DRAFT:PUBLISHED' });
  });
});
