import { describe, expect, it } from 'vitest';
import { signFileUrl } from '@projectx/edge';
import { parseConfig } from '../src/config';
import { IDS, memoryHarness, token } from './helpers';

type J = { data?: any; meta?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<J> => (await r.json()) as J;
const adm = () => token(IDS.admin);
const rev = () => token(IDS.reviewer);

describe('review-finding fixes (memory)', () => {
  it('H2: AI_VERIFY payload carries solution_version_id, key follows AI_PIPELINE; repeat without force reports existing', async () => {
    const { req, state } = memoryHarness();
    const t = await adm();
    const solId = state.solutions.find((x) => x.question_id === IDS.qDraft)!.id;
    const run = (force?: boolean) =>
      req(`/admin/questions/${IDS.qDraft}/verification/run`, { method: 'POST', token: t, json: { stages: ['VERIFY'], ...(force ? { force } : {}) } });
    const r1 = await j(await run());
    expect(r1.data.job_ids).toHaveLength(1);
    expect(r1.data.existing_job_ids).toEqual([]);
    const job = state.jobs.find((x) => x.kind === 'AI_VERIFY')!;
    expect(job.idempotency_key).toBe(`AI_VERIFY:${IDS.qDraft}:${solId}:v1`);
    expect(state.jobPayloads.get(job.id)).toEqual({ question_id: IDS.qDraft, solution_version_id: solId });
    const r2 = await j(await run());
    expect(r2.data.existing_job_ids).toEqual(r1.data.job_ids);
    expect(r2.data.message).toMatch(/already exist/);
    expect(state.jobs.filter((x) => x.kind === 'AI_VERIFY')).toHaveLength(1);
    const r3 = await j(await run(true));
    expect(r3.data.existing_job_ids).toEqual([]);
    expect(state.jobs.filter((x) => x.kind === 'AI_VERIFY')).toHaveLength(2);
  });

  it('H2: REVIEWER cannot approve a DISPUTED question, nor one whose dispute is still unresolved', async () => {
    const { req, state } = memoryHarness();
    const a = await adm();
    const r = await rev();
    const solId = state.solutions.find((x) => x.question_id === IDS.qDraft)!.id;
    const d = await j(await req(`/admin/questions/${IDS.qDraft}/dispute`, { method: 'POST', token: a, json: { reason: 'key looks wrong' } }));
    const denied = await req(`/admin/questions/${IDS.qDraft}/approve`, { method: 'POST', token: r, json: { solution_version_id: solId, expected_row_version: d.data.row_version } });
    expect(denied.status).toBe(403);
    // status moved off DISPUTED without an ADMIN resolving it (e.g. pipeline) -> still ADMIN only
    const row = state.questions.find((x) => x.id === IDS.qDraft)!;
    row.verification_status = 'HUMAN_REVIEW_REQUIRED';
    const denied2 = await req(`/admin/questions/${IDS.qDraft}/approve`, { method: 'POST', token: r, json: { solution_version_id: solId, expected_row_version: row.row_version } });
    expect(denied2.status).toBe(403);
    const ok = await req(`/admin/questions/${IDS.qDraft}/approve`, { method: 'POST', token: a, json: { solution_version_id: solId, expected_row_version: row.row_version } });
    expect(ok.status).toBe(200);
  });

  it('H4: approve stores the canonical final answer as answer_key, keeping source when equal', async () => {
    const { req, state } = memoryHarness();
    const solId = state.solutions.find((x) => x.question_id === IDS.qDraft)!.id;
    const sol = state.solutions.find((x) => x.id === solId)!;
    const fa = sol.final_answer as { type: 'SINGLE_MCQ'; correct_option_ids: string[] };
    const q = state.questions.find((x) => x.id === IDS.qDraft)!;
    q.answer_key = { ...fa };
    q.answer_key_source = 'OFFICIAL';
    const ap = await j(await req(`/admin/questions/${IDS.qDraft}/approve`, { method: 'POST', token: await adm(), json: { solution_version_id: solId, expected_row_version: q.row_version } }));
    expect(ap.data.answer_key_source).toBe('OFFICIAL');
    expect(state.questions.find((x) => x.id === IDS.qDraft)!.answer_key).toEqual(fa);
  });

  it('M2: rejecting a non-current solution on a PUBLISHED question keeps verification_status', async () => {
    const { req, state } = memoryHarness();
    const t = await adm();
    const base = state.solutions.find((x) => x.question_id === IDS.qSingle)!;
    const sol = await j(
      await req(`/admin/questions/${IDS.qSingle}/solutions`, {
        method: 'POST',
        token: t,
        json: { final_answer: base.final_answer, steps: [{ index: 1, title: null, blocks: [{ type: 'paragraph', text: 'alt' }] }], edit_note: 'alt version' },
      }),
    );
    const res = await req(`/admin/questions/${IDS.qSingle}/reject`, { method: 'POST', token: t, json: { target: 'SOLUTION', solution_version_id: sol.data.id, reason: 'bad alt' } });
    expect(res.status).toBe(200);
    const b = await j(res);
    expect(b.data.verification_status).toBe('HUMAN_VERIFIED');
    expect(b.data.publication_status).toBe('PUBLISHED');
    expect(state.questions.find((x) => x.id === IDS.qSingle)!.current_solution_id).toBe(base.id);
  });

  it('H3: /files/:token only serves USER_UPLOADS, as attachment + nosniff', async () => {
    const { req, storage, deps } = memoryHarness();
    await storage.USER_UPLOADS.put('u/a.png', new Uint8Array([1, 2, 3]), { contentType: 'text/html' });
    await storage.SOURCE_DOCS.put('s/x.pdf', new Uint8Array([1]), { contentType: 'application/pdf' });
    const sign = (bucket: 'USER_UPLOADS' | 'SOURCE_DOCS', key: string) =>
      signFileUrl({ secret: deps.config.SIGNING_SECRET, baseUrl: 'https://x.test/files', bucket: bucket as 'USER_UPLOADS', key, expiresInSec: 60, now: Date.now() });
    const good = await sign('USER_UPLOADS', 'u/a.png');
    const r = await req(`/files/${good.split('/files/')[1]}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Disposition')).toBe('attachment');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const other = await sign('SOURCE_DOCS', 's/x.pdf');
    expect((await req(`/files/${other.split('/files/')[1]}`)).status).toBe(403);
  });

  it('H3: secrets required for gcs storage and staging/production; M4: AUTH_MODE=test only dev/test', () => {
    const base = { APP_ENV: 'test', AUTH_MODE: 'test', TEST_JWT_SECRET: 'x'.repeat(32) };
    expect(() => parseConfig({ ...base, STORAGE_DRIVER: 'gcs' })).toThrow(/SIGNING_SECRET/);
    expect(() => parseConfig({ ...base, STORAGE_DRIVER: 'gcs', SIGNING_SECRET: 's'.repeat(32), IP_HASH_SECRET: 'short' })).toThrow(/IP_HASH_SECRET/);
    expect(() => parseConfig({ ...base, STORAGE_DRIVER: 'gcs', SIGNING_SECRET: 's'.repeat(32), IP_HASH_SECRET: 'y'.repeat(32), GCS_BUCKET_SOURCE_DOCS: 'a', GCS_BUCKET_PUBLIC_ASSETS: 'b', GCS_BUCKET_USER_UPLOADS: 'c' })).not.toThrow();
    const hs = { APP_ENV: 'staging', AUTH_MODE: 'hs256', SUPABASE_JWT_SECRET: 'x' };
    expect(() => parseConfig(hs)).toThrow(/SIGNING_SECRET/);
    expect(() => parseConfig({ ...hs, SIGNING_SECRET: 's'.repeat(32), IP_HASH_SECRET: 'y'.repeat(32) })).not.toThrow();
    const sec = { SIGNING_SECRET: 's'.repeat(32), IP_HASH_SECRET: 'y'.repeat(32), TEST_JWT_SECRET: 'x'.repeat(32), AUTH_MODE: 'test' };
    expect(() => parseConfig({ ...sec, APP_ENV: 'staging' })).toThrow(/AUTH_MODE=test/);
    expect(() => parseConfig({ ...sec, APP_ENV: 'production' })).toThrow(/AUTH_MODE=test/);
    expect(() => parseConfig({ ...sec, APP_ENV: 'development' })).not.toThrow();
  });

  it('POST /admin/sources with reuse_permitted=true -> 422', async () => {
    const { req } = memoryHarness();
    const r = await req('/admin/sources', { method: 'POST', token: await adm(), json: { code: 'BADSRC', name: 'Bad', kind: 'LICENSED_PUBLISHER', reuse_permitted: true } });
    expect(r.status).toBe(422);
  });
});

describe('B7: web revalidation config', () => {
  const base = { APP_ENV: 'test', AUTH_MODE: 'test', TEST_JWT_SECRET: 'x'.repeat(32) };
  it('requires a >= 32 char secret when WEB_REVALIDATE_URL is set', () => {
    expect(() => parseConfig(base)).not.toThrow();
    expect(() => parseConfig({ ...base, WEB_REVALIDATE_URL: 'http://localhost:3000/api/revalidate/' })).toThrow(/WEB_REVALIDATE_SECRET/);
    expect(() => parseConfig({ ...base, WEB_REVALIDATE_URL: 'http://localhost:3000/api/revalidate/', WEB_REVALIDATE_SECRET: 'short' })).toThrow(/WEB_REVALIDATE_SECRET/);
    expect(parseConfig({ ...base, WEB_REVALIDATE_URL: 'http://localhost:3000/api/revalidate/', WEB_REVALIDATE_SECRET: 'w'.repeat(32) }).WEB_REVALIDATE_URL).toBe('http://localhost:3000/api/revalidate/');
  });
  it('blank values (as in .env.example) are treated as unset', () => {
    expect(() => parseConfig({ ...base, WEB_REVALIDATE_URL: '', WEB_REVALIDATE_SECRET: '' })).not.toThrow();
  });
});
