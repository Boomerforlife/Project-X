import { describe, expect, it } from "vitest";
import { paperYear, routes, safeNext } from "./routes";

describe("routes", () => {
  it("reads the year from API paper slugs", () => {
    expect(paperYear("jee-main-2024-01-27-shift-1")).toBe(2024);
    expect(paperYear("jee-main-2026-04-08-shift-2")).toBe(2026);
    expect(paperYear("demo-paper")).toBeNull();
  });

  it("builds paper pages from a slug", () => {
    expect(routes.pyqPaperFromSlug("jee", "jee-main-2025-01-22-shift-1")).toBe("/jee/pyq/2025/jee-main-2025-01-22-shift-1/");
    expect(routes.pyqPaperFromSlug("jee", "jm-demo-1")).toBe("/jee/pyq/");
  });

  it("only accepts same-site next paths", () => {
    expect(safeNext("/jee/physics/")).toBe("/jee/physics/");
    expect(safeNext("https://evil.example/")).toBe("/dashboard/");
    expect(safeNext("//evil.example/")).toBe("/dashboard/");
    expect(safeNext("/\\evil.example/")).toBe("/dashboard/");
    expect(safeNext(null, "/")).toBe("/");
  });

  it("encodes next on auth and pricing links", () => {
    expect(routes.login("/jee/pyq/?a=1")).toBe("/login/?next=%2Fjee%2Fpyq%2F%3Fa%3D1");
    expect(routes.pricing()).toBe("/pricing/");
  });
});
