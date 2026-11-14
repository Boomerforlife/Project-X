import type { JobKind } from '../../types.js';
import { handleClassify } from './classify.js';
import type { HandlerDeps, HandlerOutcome, JobInput } from './common.js';
import { handleSeo } from './seo.js';
import { handleSolve } from './solve.js';
import { handleVerify } from './verify.js';

export * from './common.js';
export { handleClassify, handleSolve, handleVerify, handleSeo };

export const HANDLERS: Record<JobKind, (deps: HandlerDeps, job: JobInput) => Promise<HandlerOutcome>> = {
  AI_CLASSIFY: handleClassify,
  AI_SOLVE: handleSolve,
  AI_VERIFY: handleVerify,
  AI_SEO: handleSeo,
};
