import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asSuperuser, createTestDb, expectPgError, makeQuestion, one } from './helpers';
import type { TestDb } from './helpers';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

const q = (id: string) =>
  one<Record<string, unknown>>(
    db,
    `select slug, row_version, publication_status, verification_status, is_indexable, published_at, first_published_at, archived_at, subject_id, current_solution_id
       from questions where id = $1`,
    [id],
  );
const publish = (id: string) => asSuperuser(db, `update questions set publication_status = 'PUBLISHED' where id = $1`, [id]);
const GUARD = /PUBLISH_REQUIREMENTS_NOT_MET/;

describe('slug generation', () => {
  it('derives the slug from the first 12 words of the text', async () => {
    const m = await makeQuestion(db, { text: 'A synthetic test question about uniform motion of a particle on a line today' });
    expect(m.slug).toBe('a-synthetic-test-question-about-uniform-motion-of-a-particle-on-a');
  });
  it('appends exam slug and year when year is known', async () => {
    const m = await makeQuestion(db, { text: 'Find the modulus of a complex number', year: 2024 });
    expect(m.slug).toBe('find-the-modulus-of-a-complex-number-jee-main-2024');
  });
  it('strips LaTeX before slugifying and falls back to "question"', async () => {
    const m1 = await makeQuestion(db, { text: '$\\frac{1}{2} m v^2$ equals kinetic energy' });
    expect(m1.slug).toBe('1-2-m-v-2-equals-kinetic-energy');
    const m2 = await makeQuestion(db, { text: '$$' });
    expect(m2.slug).toBe('question');
  });
  it('adds -2, -3 on collision (including against slug_redirects)', async () => {
    const text = 'Collision test sentence for slug uniqueness';
    const a = await makeQuestion(db, { text });
    const b = await makeQuestion(db, { text });
    const c = await makeQuestion(db, { text });
    expect([a.slug, b.slug, c.slug]).toEqual([
      'collision-test-sentence-for-slug-uniqueness',
      'collision-test-sentence-for-slug-uniqueness-2',
      'collision-test-sentence-for-slug-uniqueness-3',
    ]);
    await asSuperuser(db, `update questions set slug = 'moved-away-slug' where id = $1`, [a.id]);
    const d = await makeQuestion(db, { text });
    expect(d.slug).toBe('collision-test-sentence-for-slug-uniqueness-4'); // base is a redirect now, -2/-3 taken
    const base = await makeQuestion(db, { text: 'Collision test sentence for slug uniqueness' });
    expect(base.slug).toBe('collision-test-sentence-for-slug-uniqueness-5');
  });
  it('rejects malformed slugs (check constraint)', async () => {
    await expectPgError(makeQuestion(db, { slug: 'Bad Slug' }), { code: '23514' });
    await expectPgError(makeQuestion(db, { slug: 'x'.repeat(121) }), { code: '23514' });
    await expectPgError(makeQuestion(db, { slug: 'trailing-' }), { code: '23514' });
  });
  it('slugify() and strip_latex() helpers', async () => {
    const r = await one<{ a: string; b: string; c: string }>(
      db,
      `select app_private.slugify('Newton''s Laws of Motion') a, app_private.strip_latex('$\\alpha^2_{x}$ and \\frac{a}{b}') b,
              length(app_private.slugify(repeat('word ', 40))) c`,
    );
    expect(r.a).toBe('newton-s-laws-of-motion');
    expect(r.b).toBe('2 x and a b');
    expect(r.c).toBeLessThanOrEqual(80);
  });
});

describe('slug lock and redirects', () => {
  it('a never-published question may change slug; a redirect is recorded', async () => {
    const m = await makeQuestion(db, { slug: 'draft-original-slug' });
    await asSuperuser(db, `update questions set slug = 'draft-new-slug' where id = $1`, [m.id]);
    const red = await asSuperuser<{ old_slug: string; question_id: string }>(db, `select old_slug, question_id from slug_redirects where question_id = $1`, [m.id]);
    expect(red).toEqual([{ old_slug: 'draft-original-slug', question_id: m.id }]);
  });
  it('once published, slug changes need app.allow_slug_change=on (SLUG_LOCKED otherwise)', async () => {
    const m = await makeQuestion(db, { slug: 'locked-slug-test', stage: 'PUBLISHED' });
    expect((await q(m.id)).first_published_at).not.toBeNull();
    await expectPgError(asSuperuser(db, `update questions set slug = 'locked-slug-renamed' where id = $1`, [m.id]), { message: 'SLUG_LOCKED' });
    await db.withService(async (tx) => {
      await tx.query(`select set_config('app.allow_slug_change', 'on', true)`);
      await tx.query(`update questions set slug = 'locked-slug-renamed' where id = $1`, [m.id]);
    });
    expect((await q(m.id)).slug).toBe('locked-slug-renamed');
    const red = await asSuperuser<{ old_slug: string }>(db, `select old_slug from slug_redirects where question_id = $1`, [m.id]);
    expect(red.map((r) => r.old_slug)).toEqual(['locked-slug-test']);
    // the setting is transaction-local: next transaction is locked again
    await expectPgError(asSuperuser(db, `update questions set slug = 'locked-slug-again' where id = $1`, [m.id]), { message: 'SLUG_LOCKED' });
  });
  it('unpublishing does not unlock the slug; an unchanged slug in an UPDATE is fine', async () => {
    const m = await makeQuestion(db, { slug: 'stay-locked', stage: 'PUBLISHED' });
    await asSuperuser(db, `update questions set publication_status = 'DRAFT' where id = $1`, [m.id]);
    await expectPgError(asSuperuser(db, `update questions set slug = 'stay-locked-2' where id = $1`, [m.id]), { message: 'SLUG_LOCKED' });
    await asSuperuser(db, `update questions set slug = 'stay-locked', seo_title = 'x' where id = $1`, [m.id]);
  });
  it('moving back to an old slug removes its redirect; chained renames keep every old slug', async () => {
    const m = await makeQuestion(db, { slug: 'chain-a' });
    await asSuperuser(db, `update questions set slug = 'chain-b' where id = $1`, [m.id]);
    await asSuperuser(db, `update questions set slug = 'chain-c' where id = $1`, [m.id]);
    let red = await asSuperuser<{ old_slug: string }>(db, `select old_slug from slug_redirects where question_id = $1 order by old_slug`, [m.id]);
    expect(red.map((r) => r.old_slug)).toEqual(['chain-a', 'chain-b']);
    await asSuperuser(db, `update questions set slug = 'chain-a' where id = $1`, [m.id]);
    red = await asSuperuser<{ old_slug: string }>(db, `select old_slug from slug_redirects where question_id = $1 order by old_slug`, [m.id]);
    expect(red.map((r) => r.old_slug)).toEqual(['chain-b', 'chain-c']);
  });
});

describe('taxonomy consistency', () => {
  it('fills subject from chapter when omitted', async () => {
    const r = await one<{ subject_id: string; exam_id: string }>(
      db,
      `insert into questions (exam_id, chapter_id, origin, question_type, question_text, structured_content, source_id)
       select s.exam_id, c.id, 'EDITORIAL', 'NUMERICAL', 'taxonomy fill test', '[]', (select id from sources where code='PROJECTX_EDITORIAL')
         from chapters c join subjects s on s.id = c.subject_id where c.slug = 'jee-main-chemistry-solutions'
       returning subject_id, exam_id`,
    );
    const subj = await one<{ slug: string }>(db, `select slug from subjects where id = $1`, [r.subject_id]);
    expect(subj.slug).toBe('jee-main-chemistry');
  });
  it('rejects subject from another exam, chapter from another subject, topic from another chapter', async () => {
    const m = await makeQuestion(db);
    await expectPgError(
      asSuperuser(db, `update questions set subject_id = (select id from subjects where slug = 'neet-ug-botany') where id = $1`, [m.id]),
      { message: 'TAXONOMY_MISMATCH' },
    );
    await expectPgError(
      asSuperuser(db, `update questions set chapter_id = (select id from chapters where slug = 'jee-main-chemistry-solutions') where id = $1`, [m.id]),
      { message: 'TAXONOMY_MISMATCH' },
    );
    await expectPgError(
      asSuperuser(db, `update questions set topic_id = (select id from topics where slug = 'jee-main-physics-laws-of-motion-friction') where id = $1`, [m.id]),
      { message: 'TAXONOMY_MISMATCH' },
    );
    await asSuperuser(db, `update questions set topic_id = (select id from topics where slug = 'jee-main-physics-kinematics-projectile-motion') where id = $1`, [m.id]);
  });
});

describe('questions_before_write: FTS, row_version, timestamps', () => {
  it('maintains search_tsv; websearch_to_tsquery matches stemmed words; LaTeX commands are not indexed', async () => {
    const m = await makeQuestion(db, { text: 'A projectile is launched with $\\frac{1}{2} m v^2$ kinetic energy at an angle' });
    const search = async (term: string) =>
      (await asSuperuser<{ id: string }>(db, `select id from questions where search_tsv @@ websearch_to_tsquery('english', $1) and id = $2`, [term, m.id])).length;
    expect(await search('projectile launching')).toBe(1);
    expect(await search('"kinetic energy"')).toBe(1);
    expect(await search('projectile -kinetic')).toBe(0);
    expect(await search('frac')).toBe(0);
    expect(await search('submarine')).toBe(0);
    // seo_title participates (weight A) and the vector refreshes on update
    await asSuperuser(db, `update questions set seo_title = 'Parabola trajectory trick' where id = $1`, [m.id]);
    expect(await search('parabola')).toBe(1);
    const ranked = await one<{ r: number }>(db, `select ts_rank(search_tsv, to_tsquery('english', 'parabola')) r from questions where id = $1`, [m.id]);
    expect(ranked.r).toBeGreaterThan(0);
  });
  it('row_version increments on every update', async () => {
    const m = await makeQuestion(db);
    expect((await q(m.id)).row_version).toBe(1);
    await asSuperuser(db, `update questions set seo_title = 'a' where id = $1`, [m.id]);
    await asSuperuser(db, `update questions set seo_title = 'b', row_version = 999 where id = $1`, [m.id]);
    expect((await q(m.id)).row_version).toBe(3);
  });
  it('updated_at trigger bumps updated_at', async () => {
    const m = await makeQuestion(db);
    await asSuperuser(db, `update questions set updated_at = now() - interval '1 day' where id = $1`, [m.id]);
    // explicit assignment is overwritten by the trigger
    const r = await one<{ fresh: boolean }>(db, `select updated_at > now() - interval '1 minute' as fresh from questions where id = $1`, [m.id]);
    expect(r.fresh).toBe(true);
  });
  it('publication timestamps: publish, unpublish, re-publish, archive', async () => {
    const m = await makeQuestion(db, { stage: 'READY' });
    let r = await q(m.id);
    expect([r.published_at, r.first_published_at, r.archived_at]).toEqual([null, null, null]);
    await publish(m.id);
    r = await q(m.id);
    expect(r.published_at).toBeInstanceOf(Date);
    expect(r.first_published_at).toBeInstanceOf(Date);
    const first = (r.first_published_at as Date).getTime();
    await asSuperuser(db, `update questions set publication_status = 'DRAFT' where id = $1`, [m.id]);
    r = await q(m.id);
    expect(r.published_at).toBeNull();
    expect((r.first_published_at as Date).getTime()).toBe(first);
    await publish(m.id);
    r = await q(m.id);
    expect(r.published_at).toBeInstanceOf(Date);
    await asSuperuser(db, `update questions set publication_status = 'ARCHIVED' where id = $1`, [m.id]);
    r = await q(m.id);
    expect(r.published_at).toBeNull();
    expect(r.archived_at).toBeInstanceOf(Date);
    expect(r.is_indexable).toBe(false);
  });
});

describe('table constraints', () => {
  it('PYQ questions require a source', async () => {
    await expectPgError(
      asSuperuser(db, `insert into questions (exam_id, origin, question_type, question_text, structured_content) values ((select id from exams where slug='jee-main'), 'PYQ', 'NUMERICAL', 't', '[]')`),
      { code: '23514' },
    );
  });
  it('answer_key and answer_key_source are set together', async () => {
    const m = await makeQuestion(db);
    await expectPgError(asSuperuser(db, `update questions set answer_key = '{"type":"NUMERICAL"}' where id = $1`, [m.id]), { code: '23514' });
    await expectPgError(asSuperuser(db, `update questions set answer_key_source = 'HUMAN' where id = $1`, [m.id]), { code: '23514' });
  });
  it('structured_content must be an array; seo lengths enforced; marks positive', async () => {
    const m = await makeQuestion(db);
    await expectPgError(asSuperuser(db, `update questions set structured_content = '{}' where id = $1`, [m.id]), { code: '23514' });
    await expectPgError(asSuperuser(db, `update questions set seo_title = repeat('x', 71) where id = $1`, [m.id]), { code: '23514' });
    await expectPgError(asSuperuser(db, `update questions set seo_description = repeat('x', 171) where id = $1`, [m.id]), { code: '23514' });
    await expectPgError(asSuperuser(db, `update questions set marks = 0 where id = $1`, [m.id]), { code: '23514' });
  });
  it('options: label/sort_order unique per question and cascade with the question', async () => {
    const m = await makeQuestion(db);
    await expectPgError(
      asSuperuser(db, `insert into question_options (question_id, label, sort_order, content, content_text) values ($1, 'A', 7, '[]', 'x')`, [m.id]),
      { code: '23505' },
    );
    await expectPgError(
      asSuperuser(db, `insert into question_options (question_id, label, sort_order, content, content_text) values ($1, 'E', 0, '[]', 'x')`, [m.id]),
      { code: '23505' },
    );
    await asSuperuser(db, `delete from questions where id = $1`, [m.id]);
    expect(await asSuperuser(db, `select 1 from question_options where question_id = $1`, [m.id])).toHaveLength(0);
  });
  it('question_assets need at least one owner', async () => {
    await expectPgError(
      asSuperuser(db, `insert into question_assets (kind, bucket, r2_key, mime_type, sha256) values ('IMAGE', 'PUBLIC_ASSETS', 'k', 'image/png', repeat('a', 64))`),
      { code: '23514' },
    );
    const m = await makeQuestion(db);
    await expectPgError(
      asSuperuser(db, `insert into question_assets (question_id, kind, bucket, r2_key, mime_type, sha256) values ($1, 'IMAGE', 'USER_UPLOADS', 'k', 'image/png', repeat('a', 64))`, [m.id]),
      { code: '23514' },
    );
  });
});

describe('solution versions', () => {
  it('assigns increasing versions per question', async () => {
    const a = await makeQuestion(db, { stage: 'READY' });
    const b = await makeQuestion(db, { stage: 'READY' });
    const add = (qid: string) =>
      one<{ version: number }>(
        db,
        `insert into solution_versions (question_id, final_answer, steps, provenance) values ($1, '{"type":"NUMERICAL","accepted_ranges":[{"min":"1","max":"1"}],"display_value":"1"}', '[]', 'AI_GENERATED') returning version`,
        [qid],
      );
    expect((await add(a.id)).version).toBe(2); // READY already created v1
    expect((await add(a.id)).version).toBe(3);
    expect((await add(b.id)).version).toBe(2);
    expect(await asSuperuser(db, `select version from solution_versions where question_id = $1 order by version`, [a.id])).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
  });
  it('client-supplied version is overwritten', async () => {
    const a = await makeQuestion(db);
    const r = await one<{ version: number }>(
      db,
      `insert into solution_versions (question_id, version, final_answer, steps, provenance) values ($1, 42, '{}', '[]', 'AI_GENERATED') returning version`,
      [a.id],
    );
    expect(r.version).toBe(1);
  });
  it('is immutable except review_status/reviewed_by/reviewed_at', async () => {
    const a = await makeQuestion(db, { stage: 'READY' });
    const sid = a.solutionId!;
    await expectPgError(asSuperuser(db, `update solution_versions set summary = 'changed' where id = $1`, [sid]), { message: 'SOLUTION_IMMUTABLE' });
    await expectPgError(asSuperuser(db, `update solution_versions set steps = '[1]' where id = $1`, [sid]), { message: 'SOLUTION_IMMUTABLE' });
    await expectPgError(asSuperuser(db, `update solution_versions set final_answer = '{}' where id = $1`, [sid]), { message: 'SOLUTION_IMMUTABLE' });
    await expectPgError(asSuperuser(db, `update solution_versions set version = 9 where id = $1`, [sid]), { message: 'SOLUTION_IMMUTABLE' });
    await asSuperuser(db, `update solution_versions set review_status = 'SUPERSEDED', reviewed_at = now() where id = $1`, [sid]);
    expect((await one<{ review_status: string }>(db, `select review_status from solution_versions where id = $1`, [sid])).review_status).toBe('SUPERSEDED');
  });
  it('cannot be deleted directly, but cascade from the question works', async () => {
    const a = await makeQuestion(db, { stage: 'READY' });
    await expectPgError(asSuperuser(db, `delete from solution_versions where id = $1`, [a.solutionId]), { message: 'SOLUTION_IMMUTABLE' });
    await asSuperuser(db, `delete from questions where id = $1`, [a.id]);
    expect(await asSuperuser(db, `select 1 from solution_versions where question_id = $1`, [a.id])).toHaveLength(0);
  });
  it('current_solution_id FK is checked at commit, not statement time (deferred)', async () => {
    const a = await makeQuestion(db);
    await db.withService(async (tx) => {
      const sid = '55555555-5555-4555-8555-555555555555';
      await tx.query(`update questions set current_solution_id = $2 where id = $1`, [a.id, sid]); // dangling for now
      await tx.query(
        `insert into solution_versions (id, question_id, final_answer, steps, provenance) values ($1, $2, '{}', '[]', 'AI_GENERATED')`,
        [sid, a.id],
      );
    });
    expect((await q(a.id)).current_solution_id).toBe('55555555-5555-4555-8555-555555555555');
    await expectPgError(asSuperuser(db, `update questions set current_solution_id = gen_random_uuid() where id = $1`, [a.id]), { code: '23503' });
  });
});

describe('publication guard', () => {
  it('publishes a complete question (SINGLE, MULTI, NUMERICAL)', async () => {
    for (const type of ['SINGLE_MCQ', 'MULTI_MCQ', 'NUMERICAL'] as const) {
      const m = await makeQuestion(db, { stage: 'READY', type });
      await publish(m.id);
      const r = await q(m.id);
      expect(r.publication_status, type).toBe('PUBLISHED');
      expect(r.is_indexable, type).toBe(true);
    }
  });

  const cases: { name: string; setup: (m: Awaited<ReturnType<typeof makeQuestion>>) => Promise<unknown>; type?: 'SINGLE_MCQ' | 'MULTI_MCQ' | 'NUMERICAL'; reason: RegExp }[] = [
    { name: 'verification_status PENDING', setup: (m) => asSuperuser(db, `update questions set verification_status = 'PENDING' where id = $1`, [m.id]), reason: /verification_status/ },
    { name: 'verification_status AUTOMATED_CHECKS_PASSED', setup: (m) => asSuperuser(db, `update questions set verification_status = 'AUTOMATED_CHECKS_PASSED' where id = $1`, [m.id]), reason: /verification_status/ },
    { name: 'verification_status HUMAN_REVIEW_REQUIRED', setup: (m) => asSuperuser(db, `update questions set verification_status = 'HUMAN_REVIEW_REQUIRED' where id = $1`, [m.id]), reason: /verification_status/ },
    { name: 'verification_status DISPUTED', setup: (m) => asSuperuser(db, `update questions set verification_status = 'DISPUTED' where id = $1`, [m.id]), reason: /verification_status/ },
    { name: 'no current solution', setup: (m) => asSuperuser(db, `update questions set current_solution_id = null where id = $1`, [m.id]), reason: /current_solution_id/ },
    {
      name: "current solution belongs to another question",
      setup: async (m) => {
        const other = await makeQuestion(db, { stage: 'READY' });
        await asSuperuser(db, `update questions set current_solution_id = $2 where id = $1`, [m.id, other.solutionId]);
      },
      reason: /does not belong/,
    },
    { name: 'current solution not APPROVED', setup: (m) => asSuperuser(db, `update solution_versions set review_status = 'PENDING' where id = $1`, [m.solutionId]), reason: /not APPROVED/ },
    { name: 'current solution REJECTED', setup: (m) => asSuperuser(db, `update solution_versions set review_status = 'REJECTED' where id = $1`, [m.solutionId]), reason: /not APPROVED/ },
    { name: 'answer_key missing', setup: (m) => asSuperuser(db, `update questions set answer_key = null, answer_key_source = null where id = $1`, [m.id]), reason: /answer_key is required/ },
    { name: 'answer_key differs from solution final_answer', setup: (m) => asSuperuser(db, `update questions set answer_key = jsonb_set(answer_key, '{correct_option_ids}', to_jsonb(array[$2::text])) where id = $1`, [m.id, '66666666-6666-4666-8666-666666666666']), reason: /does not match/ },
    { name: 'difficulty missing', setup: (m) => asSuperuser(db, `update questions set difficulty = null where id = $1`, [m.id]), reason: /difficulty/ },
    { name: 'chapter missing', setup: (m) => asSuperuser(db, `update questions set chapter_id = null where id = $1`, [m.id]), reason: /chapter_id/ },
    { name: 'subject missing', setup: (m) => asSuperuser(db, `update questions set subject_id = null, chapter_id = null where id = $1`, [m.id]), reason: /subject_id/ },
    { name: 'MCQ with fewer than 2 options', setup: (m) => asSuperuser(db, `delete from question_options where question_id = $1 and label <> 'A'`, [m.id]), reason: /at least 2 options/ },
    { name: 'MULTI_MCQ with fewer than 2 options', type: 'MULTI_MCQ', setup: (m) => asSuperuser(db, `delete from question_options where question_id = $1 and label <> 'C'`, [m.id]), reason: /at least 2 options/ },
    {
      name: 'correct option removed (not an option of this question)',
      setup: (m) => asSuperuser(db, `delete from question_options where id = $1`, [m.optionIds[0]]),
      reason: /do not belong/,
    },
    {
      name: 'NUMERICAL with options',
      type: 'NUMERICAL',
      setup: (m) => asSuperuser(db, `insert into question_options (question_id, label, sort_order, content, content_text) values ($1, 'A', 0, '[]', 'x')`, [m.id]),
      reason: /no options/,
    },
    {
      name: 'answer_key type differs from question_type',
      setup: (m) => asSuperuser(db, `update questions set question_type = 'MULTI_MCQ' where id = $1`, [m.id]),
      reason: /type does not match/,
    },
  ];

  it.each(cases)('blocks publish: $name', async ({ setup, type, reason }) => {
    const m = await makeQuestion(db, { stage: 'READY', type: type ?? 'SINGLE_MCQ' });
    // the question is publishable before we break it
    await setup(m);
    const p = publish(m.id);
    await expectPgError(p, { message: GUARD });
    await expectPgError(publish(m.id), { message: reason });
    expect((await q(m.id)).publication_status).toBe('DRAFT');
  });

  it('also guards later changes on a PUBLISHED question (answer_key edit, verification downgrade)', async () => {
    const m = await makeQuestion(db, { stage: 'PUBLISHED' });
    await expectPgError(asSuperuser(db, `update questions set answer_key = '{"type":"SINGLE_MCQ","correct_option_ids":[]}' where id = $1`, [m.id]), { message: GUARD });
    await expectPgError(asSuperuser(db, `update questions set verification_status = 'HUMAN_REVIEW_REQUIRED' where id = $1`, [m.id]), { message: GUARD });
    await expectPgError(asSuperuser(db, `update questions set current_solution_id = null where id = $1`, [m.id]), { message: GUARD });
    expect((await q(m.id)).publication_status).toBe('PUBLISHED');
  });

  it('DISPUTED while PUBLISHED forces DRAFT (auto-unpublish); re-publishing is then blocked', async () => {
    const m = await makeQuestion(db, { stage: 'PUBLISHED' });
    expect((await q(m.id)).is_indexable).toBe(true);
    await asSuperuser(db, `update questions set verification_status = 'DISPUTED' where id = $1`, [m.id]);
    const r = await q(m.id);
    expect(r.publication_status).toBe('DRAFT');
    expect(r.verification_status).toBe('DISPUTED');
    expect(r.published_at).toBeNull();
    expect(r.first_published_at).not.toBeNull();
    expect(r.is_indexable).toBe(false);
    await expectPgError(publish(m.id), { message: GUARD });
    // resolving the dispute allows publishing again
    await asSuperuser(db, `update questions set verification_status = 'HUMAN_VERIFIED' where id = $1`, [m.id]);
    await publish(m.id);
    expect((await q(m.id)).is_indexable).toBe(true);
  });

  it('DISPUTED on a DRAFT stays DRAFT without error', async () => {
    const m = await makeQuestion(db, { stage: 'READY' });
    await asSuperuser(db, `update questions set verification_status = 'DISPUTED' where id = $1`, [m.id]);
    expect((await q(m.id)).publication_status).toBe('DRAFT');
  });

  it('archiving a published question is allowed', async () => {
    const m = await makeQuestion(db, { stage: 'PUBLISHED' });
    await asSuperuser(db, `update questions set publication_status = 'ARCHIVED' where id = $1`, [m.id]);
    expect((await q(m.id)).publication_status).toBe('ARCHIVED');
  });
});

describe('is_indexable truth table', () => {
  it('equals published AND indexability AUTO AND verified-status AND current_solution present', async () => {
    const m = await makeQuestion(db, { stage: 'READY' });
    const pubs = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
    const idxs = ['AUTO', 'NOINDEX'];
    const vers = ['PENDING', 'AUTOMATED_CHECKS_PASSED', 'OFFICIAL_KEY_MATCHED', 'HUMAN_REVIEW_REQUIRED', 'HUMAN_VERIFIED', 'DISPUTED'];
    const sols = [true, false];
    let checked = 0;
    await db.withService(async (tx) => {
      // bypass guard triggers: we are testing the generated column expression itself
      await tx.exec(`set local session_replication_role = replica`);
      for (const pub of pubs)
        for (const idx of idxs)
          for (const ver of vers)
            for (const hasSol of sols) {
              await tx.query(
                `update questions set publication_status = $2::publication_status, indexability = $3::indexability,
                        verification_status = $4::verification_status, current_solution_id = $5 where id = $1`,
                [m.id, pub, idx, ver, hasSol ? m.solutionId : null],
              );
              const r = await tx.query<{ is_indexable: boolean }>(`select is_indexable from questions where id = $1`, [m.id]);
              const expected = pub === 'PUBLISHED' && idx === 'AUTO' && (ver === 'OFFICIAL_KEY_MATCHED' || ver === 'HUMAN_VERIFIED') && hasSol;
              expect(r.rows[0]?.is_indexable, `${pub}/${idx}/${ver}/solution=${hasSol}`).toBe(expected);
              checked += 1;
            }
    });
    expect(checked).toBe(72);
  });

  it('editorial NOINDEX override flips a published question off the index', async () => {
    const m = await makeQuestion(db, { stage: 'PUBLISHED' });
    expect((await q(m.id)).is_indexable).toBe(true);
    await asSuperuser(db, `update questions set indexability = 'NOINDEX' where id = $1`, [m.id]);
    expect((await q(m.id)).is_indexable).toBe(false);
    expect((await q(m.id)).publication_status).toBe('PUBLISHED');
  });
});
