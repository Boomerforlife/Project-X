import { describe, expect, it } from 'vitest';
import { r2Keys } from '@projectx/edge';
import type { AssetRow } from '../src/repositories/types';
import { IDS, id, memoryHarness, token } from './helpers';

type J = { data?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<J> => (await r.json()) as J;
const sha = async (b: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), (x) => x.toString(16).padStart(2, '0')).join('');
const png = (n: number): Uint8Array<ArrayBuffer> => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, n]);

function asset(over: Partial<AssetRow> & Pick<AssetRow, 'id' | 'r2_key' | 'sha256' | 'bucket'>): AssetRow {
  return { question_id: IDS.qDraft, solution_version_id: null, source_question_id: null, kind: 'IMAGE', mime_type: 'image/png', width: 10, height: 2, bytes: 9, alt_text: null, ...over };
}

/** Approves the seeded draft and attaches the given image blocks to its stem; returns the version to publish with. */
async function prepare(h: ReturnType<typeof memoryHarness>, assets: AssetRow[]): Promise<number> {
  const adm = await token(IDS.admin);
  const solId = h.state.solutions.find((s) => s.question_id === IDS.qDraft)!.id;
  h.state.assets.push(...assets);
  const q = h.state.questions.find((x) => x.id === IDS.qDraft)!;
  q.structured_content = assets.map((a) => ({ type: 'image', asset_id: a.id, alt: 'crop' })) as never;
  const ap = await h.req(`/admin/questions/${IDS.qDraft}/approve`, { method: 'POST', token: adm, json: { solution_version_id: solId, expected_row_version: q.row_version, note: 'ok' } });
  expect(ap.status).toBe(200);
  return (await j(ap)).data.row_version;
}

describe('publish copies question images to public storage', () => {
  it('an image identical to one already public gets its own key instead of staying private', async () => {
    const h = memoryHarness();
    const bytes = png(1);
    const s = await sha(bytes);
    const shared = r2Keys.publicAsset(s, 'png');
    await h.storage.PUBLIC_ASSETS.put(shared, bytes, { contentType: 'image/png' });
    await h.storage.SOURCE_DOCS.put('derived/doc/crops/q1-1.png', bytes, { contentType: 'image/png' });
    const other = asset({ id: id(9001), question_id: null, bucket: 'PUBLIC_ASSETS', r2_key: shared, sha256: s });
    const mine = asset({ id: id(9002), bucket: 'SOURCE_DOCS', r2_key: 'derived/doc/crops/q1-1.png', sha256: s });
    const v = await prepare(h, [mine]);
    h.state.assets.push(other);

    const pub = await h.req(`/admin/questions/${IDS.qDraft}/publish`, { method: 'POST', token: await token(IDS.admin), json: { expected_row_version: v } });
    expect(pub.status).toBe(200);
    const row = h.state.assets.find((a) => a.id === mine.id)!;
    expect(row.bucket).toBe('PUBLIC_ASSETS');
    expect(row.r2_key).toBe(shared.replace('.png', `-${mine.id.slice(0, 8)}.png`));
    expect(await h.storage.PUBLIC_ASSETS.head(row.r2_key)).not.toBeNull();
  });

  it('refuses a crop whose bytes changed after extraction', async () => {
    const h = memoryHarness();
    const recorded = await sha(png(2));
    await h.storage.SOURCE_DOCS.put('derived/doc/crops/q1-2.png', png(3), { contentType: 'image/png' }); // a later run overwrote it
    const v = await prepare(h, [asset({ id: id(9003), bucket: 'SOURCE_DOCS', r2_key: 'derived/doc/crops/q1-2.png', sha256: recorded })]);

    const pub = await h.req(`/admin/questions/${IDS.qDraft}/publish`, { method: 'POST', token: await token(IDS.admin), json: { expected_row_version: v } });
    expect(pub.status).toBe(422);
    expect((await j(pub)).error.details.unmet[0]).toMatch(/changed after extraction/);
    expect(await h.storage.PUBLIC_ASSETS.head(r2Keys.publicAsset(recorded, 'png'))).toBeNull();
  });
});
