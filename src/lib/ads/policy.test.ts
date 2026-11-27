import { describe, expect, it } from "vitest";
import {
  BLOCKED_PREFIXES,
  DEFAULT_POLICY,
  PLACEMENTS,
  type PlacementId,
  EMPTY_SESSION,
  canShowDisplay,
  deviceFor,
  infeedPositions,
  pathAllowsAds,
  pathAllowsRewarded,
  pathManualOnly,
  placementAllowed,
  resolvePolicy,
  rewardedBlock,
} from "./policy";

describe("ad placement policy", () => {
  it("never allows ads in the CBT, auth, checkout, account or admin pages", () => {
    for (const p of [
      "/cbt/abc/",
      "/tests/limit/",
      "/login/",
      "/signup/",
      "/onboarding/",
      "/pricing/",
      "/billing/success/",
      "/pay/abcdef/",
      "/account/",
      "/admin/questions/",
      "/privacy/",
      "/terms/",
      "/refund-policy",
      "/contact/",
      "/about/",
    ]) {
      expect(pathAllowsAds(p), p).toBe(false);
    }
    expect(BLOCKED_PREFIXES).toContain("/cbt/");
  });

  it("allows free users ads on content pages, and only the manual unit inside a practice session", () => {
    for (const p of ["/", "/jee/", "/plan/", "/resources/", "/practice/session/", "/dashboard/"]) expect(pathAllowsAds(p), p).toBe(true);
    expect(pathManualOnly("/practice/session")).toBe(true);
    expect(pathManualOnly("/jee/physics/")).toBe(false);
    expect(placementAllowed("question-bottom", "/practice/session/")).toBe(true);
    expect(placementAllowed("question-bottom", "/cbt/")).toBe(false);
  });

  it("allows the opt-in rewarded offer on the limit page as the one exception to the display-ad ban", () => {
    // Display and in-feed ads stay banned there...
    expect(pathAllowsAds("/tests/limit/")).toBe(false);
    for (const id of Object.keys(PLACEMENTS) as PlacementId[]) expect(placementAllowed(id, "/tests/limit/"), id).toBe(false);
    // ...but the user-initiated rewarded offer is allowed, with or without the trailing slash.
    expect(pathAllowsRewarded("/tests/limit/")).toBe(true);
    expect(pathAllowsRewarded("/tests/limit")).toBe(true);
    expect(pathAllowsRewarded("/jee/physics/")).toBe(true);
    // Every other protection holds for rewarded too.
    for (const p of ["/cbt/abc/", "/login/", "/pricing/", "/billing/success/", "/pay/x/", "/account/", "/admin/", "/terms/"]) {
      expect(pathAllowsRewarded(p), p).toBe(false);
    }
  });

  it("allows each placement only on its own pages", () => {
    expect(placementAllowed("dashboard-bottom", "/dashboard/")).toBe(true);
    expect(placementAllowed("dashboard-bottom", "/dashboard")).toBe(true);
    expect(placementAllowed("dashboard-bottom", "/practice/")).toBe(false);
    expect(placementAllowed("library-infeed", "/practice/")).toBe(true);
    expect(placementAllowed("library-infeed", "/practice/session/")).toBe(false);
    expect(placementAllowed("tests-list", "/tests/")).toBe(true);
    // A paper's start page is part of taking the test.
    expect(placementAllowed("tests-list", "/tests/jee-main-2025-s1/")).toBe(false);
    expect(placementAllowed("results-bottom", "/results/abc/")).toBe(true);
    expect(placementAllowed("content-bottom", "/jee/physics/")).toBe(true);
    expect(placementAllowed("content-bottom", "/")).toBe(false);
    expect(placementAllowed("notebook-bottom", "/mistakes/")).toBe(true);
  });

  it("puts in-feed units between rows, capped, never after the last row", () => {
    expect(infeedPositions(5, DEFAULT_POLICY, "desktop")).toEqual([]);
    expect(infeedPositions(12, DEFAULT_POLICY, "desktop")).toEqual([]);
    expect(infeedPositions(13, DEFAULT_POLICY, "desktop")).toEqual([11]);
    expect(infeedPositions(100, DEFAULT_POLICY, "desktop")).toEqual([11, 23]);
    expect(infeedPositions(100, DEFAULT_POLICY, "mobile")).toEqual([14, 29]);
  });

  it("paces display and rewarded ads per session", () => {
    expect(canShowDisplay(EMPTY_SESSION, DEFAULT_POLICY)).toBe(true);
    expect(canShowDisplay({ ...EMPTY_SESSION, displayShown: DEFAULT_POLICY.maxDisplayPerSession }, DEFAULT_POLICY)).toBe(false);
    const now = 1_000_000;
    expect(rewardedBlock(EMPTY_SESSION, now, DEFAULT_POLICY)).toBeNull();
    expect(rewardedBlock({ ...EMPTY_SESSION, rewardedStarted: 1, lastRewardedAt: now - 10_000 }, now, DEFAULT_POLICY)).toBe("TOO_SOON");
    expect(rewardedBlock({ ...EMPTY_SESSION, rewardedStarted: 1, lastRewardedAt: now - 91_000 }, now, DEFAULT_POLICY)).toBeNull();
    expect(rewardedBlock({ ...EMPTY_SESSION, rewardedStarted: 3, lastRewardedAt: 0 }, now, DEFAULT_POLICY)).toBe("SESSION_CAP");
  });

  it("device classes and policy overrides are clamped; bad JSON falls back to defaults", () => {
    expect(deviceFor(360)).toBe("mobile");
    expect(deviceFor(1280)).toBe("desktop");
    expect(resolvePolicy("not json")).toEqual(DEFAULT_POLICY);
    const p = resolvePolicy(JSON.stringify({ maxSlotsPerPage: { mobile: 9 }, infeedEvery: { desktop: 1 }, rewardedMinIntervalSec: 5 }));
    expect(p.maxSlotsPerPage.mobile).toBe(3);
    expect(p.maxSlotsPerPage.desktop).toBe(DEFAULT_POLICY.maxSlotsPerPage.desktop);
    expect(p.infeedEvery.desktop).toBe(6);
    expect(p.rewardedMinIntervalSec).toBe(30);
  });
});
