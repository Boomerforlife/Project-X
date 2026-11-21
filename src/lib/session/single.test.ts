import { describe, expect, it } from "vitest";
import { singleQuestionId } from "./store";

describe("singleQuestionId (shared single-question links)", () => {
  it("reads the question id from a single-question session id", () => {
    expect(singleQuestionId("single_30ed0bb6-e779-4c18-bb49-9178510b62cd_mwqrdi9u")).toBe("30ed0bb6-e779-4c18-bb49-9178510b62cd");
  });
  it("ignores server sessions and malformed ids", () => {
    expect(singleQuestionId("4b0c6a3e-1111-4c18-bb49-9178510b62cd")).toBeNull();
    expect(singleQuestionId("single_not-a-uuid_x")).toBeNull();
    expect(singleQuestionId("att_123")).toBeNull();
  });
});
