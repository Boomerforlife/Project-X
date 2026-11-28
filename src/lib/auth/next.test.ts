import { describe, expect, it } from "vitest";
import { safeNext, signInReason } from "./next";

describe("safeNext (post-login redirect)", () => {
  it("keeps same-origin paths with their query string", () => {
    expect(safeNext("/practice/new/?slug=abc&chapter=kinematics")).toBe("/practice/new/?slug=abc&chapter=kinematics");
    expect(safeNext("/pricing/")).toBe("/pricing/");
  });

  it("falls back for missing or non-path values", () => {
    expect(safeNext(null)).toBe("/dashboard/");
    expect(safeNext("")).toBe("/dashboard/");
    expect(safeNext("https://evil.example/")).toBe("/dashboard/");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard/");
  });

  it("rejects protocol-relative and backslash tricks that browsers resolve off-site", () => {
    expect(safeNext("//evil.example/")).toBe("/dashboard/");
    expect(safeNext("/\\evil.example/")).toBe("/dashboard/");
    expect(safeNext("/\\/evil.example/")).toBe("/dashboard/");
    expect(safeNext("/\t/evil.example/")).toBe("/dashboard/");
  });
});

describe("signInReason", () => {
  it("explains why sign-in is needed", () => {
    expect(signInReason("/cbt/?id=1")).toMatch(/exam/);
    expect(signInReason("/jee/pyq/2024/jee-main-2024-01-27-shift-1/")).toMatch(/paper/);
    expect(signInReason("/jee/questions/some-slug/")).toMatch(/answers/);
    expect(signInReason("/jee/physics/electrostatics/?practise=1")).toMatch(/chapter/);
    expect(signInReason("/dashboard/")).toMatch(/Home/);
    expect(signInReason("/about/")).toBeNull();
  });
});
