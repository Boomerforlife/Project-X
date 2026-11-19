import { describe, expect, it } from "vitest";
import { safeNext } from "./next";

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
