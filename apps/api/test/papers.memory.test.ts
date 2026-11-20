import { describe, expect, it } from 'vitest';
import { IDS, id, memoryHarness, token } from './helpers';

type J = { data?: any; meta?: any; error?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const j = async (r: Response): Promise<J> => (await r.json()) as J;

const PAPER = id(800);
const HIDDEN = id(6);

/**
 * One paper with two questions: demo-single (Kinematics) and demo-numerical, which only has an official answer and no
 * confident chapter, so it sits in the hidden "Not yet tagged" chapter (migration 0028) and is published for papers only.
 */
function setup() {
  const h = memoryHarness();
  h.state.taxonomy.chapters.push({
    id: HIDDEN, subject_id: IDS.subject, slug: 'jee-main-physics-not-yet-tagged', segment: 'not-yet-tagged', name: 'Not yet tagged',
    unit_number: null, class_level: null, description: null, is_active: false, sort_order: 999,
  });
  h.state.papers.push({ id: PAPER, exam_id: IDS.exam, slug: 'jee-main-2026-04-02-shift-1', title: 'JEE Main 2026 (2 Apr 2026, Shift 1)', year: 2026, session_label: 'April', exam_date: '2026-04-02', shift: 1, paper_code: null });
  const single = h.state.questions.find((q) => q.id === IDS.qSingle)!;
  Object.assign(single, { paper_id: PAPER, origin: 'PYQ', question_number: '2' });
  const num = h.state.questions.find((q) => q.id === IDS.qNum)!;
  Object.assign(num, { paper_id: PAPER, origin: 'PYQ', question_number: '1', chapter_id: HIDDEN, topic_id: null });
  return h;
}

describe('full previous-year papers', () => {
  it('lists a complete paper with its question count, sections and duration', async () => {
    const h = setup();
    const r = await h.req('/public/papers?exam=jee-main');
    expect(r.status).toBe(200);
    const d = (await j(r)).data;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ slug: 'jee-main-2026-04-02-shift-1', question_count: 2, duration_min: 180, year: 2026 });
    expect(d[0].sections).toEqual([{ subject: expect.objectContaining({ segment: 'physics' }), question_count: 2 }]);
    expect((await h.req('/public/papers?exam=nope')).status).toBe(404);
  });

  it('hides a paper while a question with an official answer is still unpublished', async () => {
    const h = setup();
    Object.assign(h.state.questions.find((q) => q.id === IDS.qDraft)!, { paper_id: PAPER, answer_key: { type: 'SINGLE_MCQ', correct_option_ids: [id(1021)] } });
    expect((await j(await h.req('/public/papers?exam=jee-main'))).data).toEqual([]);
  });

  it('a paper session is the whole paper in paper order, solved or not, and names its paper', async () => {
    const h = setup();
    const t = await token(IDS.user);
    const r = await h.req('/practice/sessions', {
      method: 'POST', token: t,
      json: { client_request_id: id(7100), mode: 'PYQ_PAPER', exam: 'jee-main', paper: 'jee-main-2026-04-02-shift-1', size: 1, ui_mode: 'test', time_limit_sec: 10800, filters: { exclude_correct: true, difficulty: ['HARD'] } },
    });
    expect(r.status).toBe(201);
    const d = (await j(r)).data;
    expect(d.questions.map((q: { id: string }) => q.id)).toEqual([IDS.qNum, IDS.qSingle]);
    expect(d.session.paper).toEqual({ slug: 'jee-main-2026-04-02-shift-1', title: 'JEE Main 2026 (2 Apr 2026, Shift 1)' });
    const detail = (await j(await h.req(`/practice/sessions/${d.session.id}`, { token: t }))).data;
    expect(detail.session.paper.slug).toBe('jee-main-2026-04-02-shift-1');
  });

  it('keeps paper-only questions off public pages, lists, counts and ordinary practice', async () => {
    const h = setup();
    expect((await h.req('/public/questions/demo-numerical')).status).toBe(404);
    expect((await h.req('/public/questions/demo-single')).status).toBe(200);
    const listed = (await j(await h.req('/practice/questions?exam=jee-main&limit=50'))).data.map((q: { id: string }) => q.id);
    expect(listed).toContain(IDS.qSingle);
    expect(listed).not.toContain(IDS.qNum);
    const exam = (await j(await h.req('/public/exams/jee-main'))).data;
    expect(exam.subjects[0].published_question_count).toBe(2); // demo-single + demo-multi, not the paper-only one
    const t = await token(IDS.user);
    const mixed = (await j(await h.req('/practice/sessions', { method: 'POST', token: t, json: { client_request_id: id(7101), mode: 'MIXED', exam: 'jee-main', size: 50, filters: { exclude_correct: false } } }))).data;
    expect(mixed.questions.map((q: { id: string }) => q.id)).not.toContain(IDS.qNum);
  });
});
