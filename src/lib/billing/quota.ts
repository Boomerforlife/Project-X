export type QuotaDetails = { used: number; limit: number; resets_on: string };

/** Thrown by startPractice when the API returns QUOTA_EXCEEDED (free full-paper allowance used up). */
export class QuotaExceededError extends Error {
  constructor(readonly details: QuotaDetails) {
    super("Free full-paper limit reached");
    this.name = "QuotaExceededError";
  }
}
