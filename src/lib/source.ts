import type { Source } from "@/contracts";
import { EXAMS } from "@/lib/exams";

/**
 * Where a question comes from, as one short line shown with the question ("JEE Advanced 2025 Paper 1",
 * "JEE Main 2024 · April · Shift 2"). Prefers the official paper title the backend sends; never invents one.
 */
export function sourceLabel(src: Source): string {
  if (src.kind === "pyq") {
    if (src.paper) return src.paper;
    return [EXAMS[src.exam].name, src.year || null, src.session, src.shift != null ? `Shift ${src.shift}` : null]
      .filter((x) => x != null && x !== "")
      .join(" · ");
  }
  return src.kind === "original" ? "Practice question" : "Sample (development)";
}
