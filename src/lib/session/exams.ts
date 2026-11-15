import { EXAM_LIST } from "@/lib/exams";
import { DATA_SOURCE } from "@/lib/site";
import { registry } from "./registry";

/** Exams a student can choose. API mode: only exams the backend reports as active. */
export function availableExams() {
  if (DATA_SOURCE !== "api") return EXAM_LIST;
  const active = registry.exams();
  return EXAM_LIST.filter((e) => active.includes(e.id));
}
