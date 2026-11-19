import { describe, expect, it } from "vitest";
import {
  BLOCKED_PREFIXES,
  DEFAULT_POLICY,
  EMPTY_SESSION,
  canShowDisplay,
  deviceFor,
  infeedPositions,
  pathAllowsAds,
  placementAllowed,
  resolvePolicy,
  rewardedBlock,
} from "./policy";

describe("ad placement policy", () => {
  it("never allows ads in tests, CBT, sessions, auth, checkout, account, admin or legal pages", () => {
    for (const p of [
      "/cbt/abc/",
      "/practice/session/",
      "/practice/session",
      "/tests/limit/",
      "/login/",
      "/signup/",
      "/onboarding/",
      "/pricing/",
      "/billing/success/",
      "/pay/abcdef/",
      "/account/",
      "/admin/questions/",
      "/plan/",
      "/terms/",
    ]) {
      expect(pathAllowsAds(p), p).toBe(false);
    }
    expect(BLOCKED_PREFIXES).toContain("/cbt/");
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
