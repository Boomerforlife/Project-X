/**
 * Central advertising policy (pure; unit-tested in policy.test.ts). Decides WHERE an ad may appear and HOW OFTEN.
 * Whether the viewer gets ads at all (free vs Plus) comes from the server (GET /entitlements); this module never
 * overrides that. Retention and learning come first: these defaults are deliberately conservative.
 *
 * Free users see ads on every content page (Auto ads + the manual placements below). Never shown:
 *   - in the CBT exam shell or on a test's limit page (accidental taps next to exam controls = invalid traffic),
 *   - on sign-in, onboarding, pricing, checkout, payment links, account/billing, admin (no publisher content),
 *   - on error / not-found pages, or between a question's options or inside a solution.
 * Practice sessions (the question screen) carry one small manual unit below the question tools, untimed sessions
 * only; Auto ads placements are hidden there (MANUAL_ONLY_PREFIXES) so nothing jumps into the question.
 */

export type Device = "mobile" | "desktop";

export type PlacementId =
  | "dashboard-bottom"
  | "library-infeed"
  | "tests-list"
  | "results-bottom"
  | "notebook-bottom"
  | "content-bottom"
  | "question-bottom";

export interface Placement {
  id: PlacementId;
  format: "display" | "infeed" | "multiplex";
  /** Path prefixes (trailing slash) this placement may render on. `exact:` = that path only. */
  routes: string[];
}

export const PLACEMENTS: Record<PlacementId, Placement> = {
  "dashboard-bottom": { id: "dashboard-bottom", format: "display", routes: ["exact:/dashboard/"] },
  "library-infeed": { id: "library-infeed", format: "infeed", routes: ["exact:/practice/"] },
  "tests-list": { id: "tests-list", format: "display", routes: ["exact:/tests/"] },
  "results-bottom": { id: "results-bottom", format: "display", routes: ["/results/"] },
  "notebook-bottom": { id: "notebook-bottom", format: "display", routes: ["exact:/mistakes/", "exact:/bookmarks/", "exact:/review/", "exact:/progress/"] },
  "content-bottom": { id: "content-bottom", format: "multiplex", routes: ["/jee/", "/neet/", "/resources/", "/study-plans/"] },
  "question-bottom": { id: "question-bottom", format: "display", routes: ["/practice/session/"] },
};

/** No ad of any kind on these paths, whatever a component asks for. */
export const BLOCKED_PREFIXES = [
  "/cbt/",
  "/practice/new/",
  "/tests/limit/",
  "/login/",
  "/signup/",
  "/onboarding/",
  "/pricing/",
  "/billing/",
  "/pay/",
  "/account/",
  "/admin/",
];

/** Manual units only: Auto ads placements (anchors, side rails, in-page) are hidden so nothing lands inside a question. */
export const MANUAL_ONLY_PREFIXES = ["/practice/session/"];

export function pathManualOnly(path: string): boolean {
  const p = withSlash(path || "/");
  return MANUAL_ONLY_PREFIXES.some((b) => p.startsWith(b));
}

export interface AdPolicy {
  /** Ad units on one page, by device. */
  maxSlotsPerPage: Record<Device, number>;
  /** In a list, one in-feed unit after every N rows, at most `infeedMaxPerList` units, never before row N. */
  infeedEvery: Record<Device, number>;
  infeedMaxPerList: number;
  /** Display units rendered in one browser session (tab); after this, placements stay empty. */
  maxDisplayPerSession: number;
  /** Rewarded: minimum seconds between two rewarded ads the student starts, and at most this many per session. */
  rewardedMinIntervalSec: number;
  rewardedMaxPerSession: number;
}

export const DEFAULT_POLICY: AdPolicy = {
  maxSlotsPerPage: { mobile: 1, desktop: 2 },
  infeedEvery: { mobile: 15, desktop: 12 },
  infeedMaxPerList: 2,
  maxDisplayPerSession: 40,
  rewardedMinIntervalSec: 90,
  rewardedMaxPerSession: 3,
};

const clampInt = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;

/** Merge a JSON override (NEXT_PUBLIC_ADS_POLICY) into the defaults, clamped to sane ranges. Bad JSON = defaults. */
export function resolvePolicy(json: string): AdPolicy {
  if (!json) return DEFAULT_POLICY;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(json) as Record<string, unknown>;
    if (!o || typeof o !== "object") return DEFAULT_POLICY;
  } catch {
    return DEFAULT_POLICY;
  }
  const d = DEFAULT_POLICY;
  const per = (k: "maxSlotsPerPage" | "infeedEvery", lo: number, hi: number) => {
    const v = (o[k] ?? {}) as Record<string, unknown>;
    return { mobile: clampInt(v.mobile, lo, hi, d[k].mobile), desktop: clampInt(v.desktop, lo, hi, d[k].desktop) };
  };
  return {
    maxSlotsPerPage: per("maxSlotsPerPage", 0, 3),
    infeedEvery: per("infeedEvery", 6, 50),
    infeedMaxPerList: clampInt(o.infeedMaxPerList, 0, 4, d.infeedMaxPerList),
    maxDisplayPerSession: clampInt(o.maxDisplayPerSession, 0, 200, d.maxDisplayPerSession),
    rewardedMinIntervalSec: clampInt(o.rewardedMinIntervalSec, 30, 86_400, d.rewardedMinIntervalSec),
    rewardedMaxPerSession: clampInt(o.rewardedMaxPerSession, 0, 10, d.rewardedMaxPerSession),
  };
}

const withSlash = (p: string) => (p.endsWith("/") ? p : `${p}/`);

export function pathAllowsAds(path: string): boolean {
  const p = withSlash(path || "/");
  return !BLOCKED_PREFIXES.some((b) => p.startsWith(b));
}

export function placementAllowed(id: PlacementId, path: string): boolean {
  const p = withSlash(path || "/");
  if (!pathAllowsAds(p)) return false;
  return PLACEMENTS[id].routes.some((r) => (r.startsWith("exact:") ? p === r.slice(6) : p.startsWith(r)));
}

export function deviceFor(width: number): Device {
  return width < 768 ? "mobile" : "desktop";
}

/** Row indexes after which an in-feed unit goes (0-based: [11] means "after the 12th row"). Never after the last row. */
export function infeedPositions(rows: number, policy: AdPolicy, device: Device): number[] {
  const every = policy.infeedEvery[device];
  const out: number[] = [];
  for (let i = every - 1; i < rows - 1 && out.length < policy.infeedMaxPerList; i += every) out.push(i);
  return out;
}

/** Per-tab counters (sessionStorage). A convenience for pacing, never a security control. */
export interface AdSessionState {
  displayShown: number;
  rewardedStarted: number;
  lastRewardedAt: number;
}
export const EMPTY_SESSION: AdSessionState = { displayShown: 0, rewardedStarted: 0, lastRewardedAt: 0 };

export function canShowDisplay(s: AdSessionState, policy: AdPolicy): boolean {
  return s.displayShown < policy.maxDisplayPerSession;
}

export type RewardedBlock = null | "SESSION_CAP" | "TOO_SOON";
export function rewardedBlock(s: AdSessionState, now: number, policy: AdPolicy): RewardedBlock {
  if (s.rewardedStarted >= policy.rewardedMaxPerSession) return "SESSION_CAP";
  if (s.lastRewardedAt && now - s.lastRewardedAt < policy.rewardedMinIntervalSec * 1000) return "TOO_SOON";
  return null;
}
