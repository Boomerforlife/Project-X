import { describe, expect, it } from "vitest";
import { DEMO_ENTITLEMENTS } from "@/lib/api/monetization";
import { compareGroups, plusHighlights, type CompareInput } from "./compare";

const base: CompareInput = { free: DEMO_ENTITLEMENTS, freeFullPapersPerMonth: 2, papersVisible: false, adsLive: false };
const rows = (i: CompareInput) => compareGroups(i).flatMap((g) => g.rows);
const feature = (i: CompareInput, name: string) => rows(i).find((r) => r.feature === name);

describe("pricing comparison (only what the server enforces and this build shows)", () => {
  it("takes free-tier numbers from the server's entitlements", () => {
    expect(feature(base, "Problem library versions")?.free.text).toBe("3 per problem");
    expect(feature(base, "Study plan")?.free.text).toBe("Up to 7 days, 60 min a day");
    expect(feature(base, "Study plan")?.plus.text).toBe("Up to 14 days, 120 min a day");
  });

  it("never sells full papers / CBT when the build hides them", () => {
    expect(feature(base, "Full papers and CBT mocks")).toBeUndefined();
    expect(plusHighlights(compareGroups(base)).join(" ")).not.toMatch(/CBT|full paper/i);
    const on = feature({ ...base, papersVisible: true }, "Full papers and CBT mocks");
    expect(on?.free).toEqual({ kind: "limited", text: "2 a month" });
    expect(on?.plus.text).toBe("Unlimited");
  });

  it("does not promise ad-free or solution extras until they are real", () => {
    expect(feature(base, "Ads")).toBeUndefined();
    expect(feature(base, "Solution extras")).toBeUndefined();
    expect(feature({ ...base, adsLive: true }, "Ads")?.plus.text).toBe("No ads");
    // A configured publisher makes Free ad-supported even before units go live.
    expect(feature({ ...base, adsPlanned: true }, "Ads")?.free.text).toBe("Ad-supported");
    expect(feature({ ...base, solutionExtras: true }, "Solution extras")?.free.kind).toBe("no");
  });

  it("drops capped rows when the server could not be reached, instead of guessing numbers", () => {
    const off = { ...base, free: null };
    expect(feature(off, "Problem library versions")).toBeUndefined();
    expect(feature(off, "Study plan")).toBeUndefined();
    expect(feature(off, "Practice questions")?.free.text).toBe("Unlimited");
  });

  it("highlights only rows where Plus adds something", () => {
    const h = plusHighlights(compareGroups(base));
    expect(h).toContain("Every version of each library problem");
    expect(h).toContain("The full diagnostic report, chapter by chapter");
    for (const r of rows(base).filter((x) => x.highlight)) expect(r.free).not.toEqual(r.plus);
  });
});
