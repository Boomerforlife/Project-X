"use client";

import { RouteError } from "@/components/app/RouteError";

/**
 * CBT shell errors: same layout, but no mascot or wordmark (CLAUDE.md §6C).
 * Answers are autosaved, so retrying never discards the attempt.
 */
export default function ExamError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} home="/tests/" mascot={false} />;
}
