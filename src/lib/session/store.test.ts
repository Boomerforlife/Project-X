import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { Attempt } from "@/lib/demo/types";

const submitAttempt = vi.fn();
vi.mock("@/lib/api/student", () => ({ submitAttempt: (...a: unknown[]) => submitAttempt(...a) }));
vi.mock("@/components/ui/Toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ authSignOut: vi.fn(), getAccessToken: vi.fn(), onAuthChange: vi.fn() }));

import { postOne } from "./store";
import { registry } from "./registry";

const Q = "00000000-0000-4000-8000-000000000010";
const OPT = "00000000-0000-4000-8000-000000000021";

function attempt(): Attempt {
  return {
    id: "s1",
    exam: "jee-main",
    mode: "test",
    kind: "practice",
    title: "t",
    questionIds: [Q],
    sections: [],
    durationSec: null,
    startedAt: "t",
    updatedAt: "t",
    submittedAt: null,
    status: "in_progress",
    current: 0,
    elapsedSec: 0,
    responses: { [Q]: { questionId: Q, answer: { optionIds: ["A"] }, checked: false, markedForReview: false, visited: true, timeSpentSec: 3, savedAt: null } },
  } as Attempt;
}

describe("postOne error handling", () => {
  beforeEach(() => {
    submitAttempt.mockReset();
    registry.putQuestion({
      id: Q,
      slug: "q",
      exams: ["jee-main"],
      subject: "physics",
      chapter: "kinematics",
      type: "single_correct",
      stem: "s",
      assets: [],
      options: [{ id: "A", ref: OPT, body: "1" }],
      source: { kind: "original" },
      verification: { status: "processed" },
      hasSolution: true,
      publicPage: true,
    } as never);
  });

  it.each(["ALREADY_ATTEMPTED", "IDEMPOTENCY_CONFLICT"])("%s resolves to 'already' (server wins) instead of pausing", async (code) => {
    submitAttempt.mockRejectedValueOnce(new ApiError(409, code as never, "x"));
    await expect(postOne(attempt(), Q)).resolves.toBe("already");
  });

  it("other errors still propagate", async () => {
    submitAttempt.mockRejectedValueOnce(new ApiError(500, "INTERNAL" as never, "x"));
    await expect(postOne(attempt(), Q)).rejects.toMatchObject({ status: 500 });
  });

  it("reuses the same client_attempt_id across retries even when storage is unavailable", async () => {
    submitAttempt.mockRejectedValue(new ApiError(0, "NETWORK", "offline"));
    await expect(postOne(attempt(), Q)).rejects.toBeTruthy();
    await expect(postOne(attempt(), Q)).rejects.toBeTruthy();
    const ids = submitAttempt.mock.calls.map((c) => (c[0] as { client_attempt_id: string }).client_attempt_id);
    expect(ids[0]).toBe(ids[1]);
  });
});
