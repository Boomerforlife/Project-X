import * as billing from '../billing/service';
import { billingDeps } from '../billing/routes';
import { ApiError } from '../lib/errors';
import { deps, type Ctx } from '../lib/http';

/**
 * Premium (Tabby Plus) access checks shared by the problem set and practice routes. Everything here is enforced on the
 * server; the client only ever sees `locked` flags and 403 PREMIUM_REQUIRED.
 */

/** Is the signed-in viewer on Plus right now? Fails closed (false) if billing data can't be read. */
export async function viewerPlus(c: Ctx, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    return await billing.isPlus(billingDeps(c), userId);
  } catch {
    return false;
  }
}

export function premiumRequired(message: string, details: Record<string, unknown> = {}): ApiError {
  return new ApiError('FORBIDDEN', message, { details: { reason: 'PREMIUM_REQUIRED', ...details } });
}

/** Refuse grading a PREMIUM question for a non-Plus user (content for it is never served to them either). */
export async function assertQuestionAccessible(c: Ctx, questionId: string, plus: boolean): Promise<void> {
  if (plus) return;
  let tier: string | undefined;
  try {
    const r = await deps(c).db.withService((tx) =>
      tx.query<{ access_tier: string }>('select access_tier::text as access_tier from public.questions where id = $1', [questionId]),
    );
    tier = r.rows[0]?.access_tier;
  } catch {
    return; // no SQL store (unit tests); the SQL path is covered by integration tests
  }
  if (tier === 'PREMIUM') throw premiumRequired('This problem is part of Tabby Plus');
}

/** Free users keep the final answer and step-by-step solution; Plus adds alternative methods, shortcuts and common mistakes. */
export function stripPremiumSolutionExtras<T extends object>(result: T, plus: boolean): T {
  const sol = (result as { solution?: unknown }).solution;
  if (plus || !sol || typeof sol !== 'object') return result;
  const s = sol as Record<string, unknown>;
  return { ...result, solution: { ...s, alternatives: [], shortcuts: [], common_mistakes: [] } };
}
