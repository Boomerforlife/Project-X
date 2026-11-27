import { describe, expect, it } from "vitest";
import { nextAfterPricing, pricingHref } from "./pricingNext";

describe("nextAfterPricing", () => {
  it("keeps the student's page, query included", () => {
    expect(nextAfterPricing("/jee/physics/electrostatics/?page=2")).toBe("/jee/physics/electrostatics/?page=2");
  });
  it("sends the limit page to the PYQ hub, not back to the limit", () => {
    expect(nextAfterPricing("/tests/limit/?used=2&limit=2")).toBe("/jee/pyq/");
  });
  it("drops funnel pages and unsafe values", () => {
    expect(nextAfterPricing("/pricing/?next=/x/")).toBeNull();
    expect(nextAfterPricing("/billing/success/")).toBeNull();
    expect(nextAfterPricing("https://evil.example/")).toBeNull();
    expect(nextAfterPricing("//evil.example/")).toBeNull();
    expect(nextAfterPricing(null)).toBeNull();
  });
  it("builds the pricing link", () => {
    expect(pricingHref("/jee/")).toBe("/pricing/?next=%2Fjee%2F");
    expect(pricingHref("/pricing/")).toBe("/pricing/");
  });
});
