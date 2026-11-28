import { describe, expect, it } from "vitest";
import { passwordProblem } from "./password";

describe("passwordProblem", () => {
  it("accepts a reasonable password", () => {
    expect(passwordProblem("orbital7mass", "student@example.com")).toBeNull();
  });
  it("rejects short, letter-only, digit-only, common and email-based passwords", () => {
    expect(passwordProblem("ab1")).toMatch(/8 characters/);
    expect(passwordProblem("onlyletters")).toMatch(/letter and one number/);
    expect(passwordProblem("1234567890")).toMatch(/letter and one number/);
    expect(passwordProblem("Password123")).toMatch(/too common/);
    expect(passwordProblem("ravi2026x", "ravi2026@example.com")).toMatch(/email name/);
    expect(passwordProblem("a1".repeat(40))).toMatch(/at most 72/);
  });
});
