import { seo } from '../../modules/seo.js';
import { moduleCtx, requireQuestion, unwrap, type HandlerDeps, type HandlerOutcome, type JobInput } from './common.js';

/** AI_SEO: suggestions are stored only where seo_title / seo_description are still null. */
export async function handleSeo(deps: HandlerDeps, job: JobInput): Promise<HandlerOutcome> {
  const q = await requireQuestion(deps, job);
  const out = unwrap(await seo(moduleCtx(deps, job.id), q), 'SEO metadata');
  await deps.repo.applySeo(q.id, out.value.title, out.value.description);
  return { result: { stage: 'seo', ai_run_id: out.runId, keywords: out.value.keywords }, next: [] };
}
