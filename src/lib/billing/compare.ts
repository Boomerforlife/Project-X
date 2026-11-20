/**
 * Free vs Plus comparison for /pricing/. Every row is either enforced by the API today (see
 * apps/api/src/entitlements/policy.ts, problems/access.ts, billing quota, plans routes) or hidden.
 *
 * Rules (CLAUDE.md §2.4, §18.5: no invented capabilities):
 *  - Numbers for Free come from the server (`GET /entitlements` anonymous view, `GET /billing/plans`), never hardcoded.
 *  - A row whose feature is not visible in this build (papers flag, ads off) is left out instead of promised.
 *  - Plus limits mirror `planLimits("PLUS")` in the API policy: 14-day plans, 120 minutes a day, no variant cap.
 */
import type { Entitlements } from "@projectx/contracts";

/** "yes" = included, "no" = not included, "limited" = included with a cap (the text says which). */
export type Cell = { kind: "yes" | "no" | "limited"; text: string };
/** `highlight`: the one-line benefit shown on the Plus card (only rows where Plus adds something). */
export type CompareRow = { feature: string; detail?: string; free: Cell; plus: Cell; highlight?: string };
export type CompareGroup = { title: string; rows: CompareRow[] };

export type CompareInput = {
  /** Anonymous entitlements (free-tier limits). Null when the API could not be reached: capped rows are then omitted. */
  free: Entitlements | null;
  /** Free full papers a month (`GET /billing/plans` → free.full_papers_per_month). */
  freeFullPapersPerMonth: number | null;
  /** Full papers / CBT are reachable in this web build (NEXT_PUBLIC_FEATURE_PAPERS). */
  papersVisible: boolean;
  /** Display ads can actually run in this build (NEXT_PUBLIC_ADS not off and units configured). */
  adsLive: boolean;
  /** An ad publisher is configured, so Free is ad-supported (owner decision 2026-11-20: show "No ads" as a Plus benefit). */
  adsPlanned?: boolean;
  /** Published solutions carry alternatives / shortcuts / common mistakes (Plus-only extras). Off until content has them. */
  solutionExtras?: boolean;
};

const yes = (text = "Included"): Cell => ({ kind: "yes", text });
const no = (text = "Not included"): Cell => ({ kind: "no", text });
const limited = (text: string): Cell => ({ kind: "limited", text });

/** Plus plan-builder limits (API: planLimits("PLUS")). */
export const PLUS_PLAN_MAX_DAYS = 14;
export const PLUS_PLAN_MAX_DAILY_MINUTES = 120;

export function compareGroups(i: CompareInput): CompareGroup[] {
  const lim = i.free?.limits;
  const practice: CompareRow[] = [
    { feature: "Practice questions", detail: "Chapter, subject and mixed sets", free: yes("Unlimited"), plus: yes("Unlimited") },
    { feature: "Step-by-step solutions", detail: "With the answer check status shown", free: yes(), plus: yes() },
  ];
  // The API strips these for free users, but no published solution has them yet (2026-11-20), so the row stays off
  // until content does; switch `solutionExtras` on then.
  if (i.solutionExtras) {
    practice.push({
      feature: "Solution extras",
      detail: "Alternative methods, shortcuts and common mistakes",
      free: no(),
      plus: yes(),
      highlight: "Alternative methods, shortcuts and common mistakes in solutions",
    });
  }
  if (lim && lim.variants_per_problem !== null) {
    practice.push({
      feature: "Problem library versions",
      detail: "Fresh numbers for the same problem, to practise it again",
      free: limited(`${lim.variants_per_problem} per problem`),
      plus: yes("Every version"),
      highlight: "Every version of each library problem",
    });
  }

  const planning: CompareRow[] = [];
  if (lim) {
    planning.push({
      feature: "Study plan",
      detail: "Built from your diagnostic",
      free: limited(`Up to ${lim.plan_max_days} days, ${lim.plan_max_daily_minutes} min a day`),
      plus: yes(`Up to ${PLUS_PLAN_MAX_DAYS} days, ${PLUS_PLAN_MAX_DAILY_MINUTES} min a day`),
      highlight: `Study plans up to ${PLUS_PLAN_MAX_DAYS} days, ${PLUS_PLAN_MAX_DAILY_MINUTES} min a day`,
    });
  }
  planning.push({
    feature: "Diagnostic report",
    free: limited("Subject summary + top 3 focus chapters"),
    plus: yes("Every chapter"),
    highlight: "The full diagnostic report, chapter by chapter",
  });

  const exams: CompareRow[] = [];
  if (i.papersVisible) {
    exams.push({
      feature: "Full papers and CBT mocks",
      free: i.freeFullPapersPerMonth !== null ? limited(`${i.freeFullPapersPerMonth} a month`) : limited("Monthly limit"),
      plus: yes("Unlimited"),
      highlight: "Unlimited full papers and CBT mocks",
    });
  }

  const tracking: CompareRow[] = [
    { feature: "Bookmarks, review list, mistake notebook", free: yes(), plus: yes() },
    { feature: "Progress, streaks and history", free: yes(), plus: yes() },
  ];
  if (i.adsLive || i.adsPlanned) {
    tracking.push({ feature: "Ads", detail: "Never inside questions, tests or the CBT", free: limited("Ad-supported"), plus: yes("No ads"), highlight: "No ads, anywhere" });
  }

  return [
    { title: "Practice", rows: practice },
    { title: "Planning", rows: planning },
    ...(exams.length ? [{ title: "Exam practice", rows: exams }] : []),
    { title: "Tracking", rows: tracking },
  ];
}

/** The "what Plus adds" list for the Plus card, in table order. */
export function plusHighlights(groups: CompareGroup[]): string[] {
  return groups.flatMap((g) => g.rows).flatMap((r) => (r.highlight ? [r.highlight] : []));
}
