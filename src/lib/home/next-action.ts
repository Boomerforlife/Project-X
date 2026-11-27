import type { ItemView } from "@/lib/plans";

export type NextActionInput = {
  resume: { id: string; mode: string; title: string; done: number; total: number } | null;
  plan: { label: string } | null;
  mistakesDue: number;
  weak: { subject: string; chapter: string; accuracy: number; answered: number } | null;
  firstRun: boolean;
};

export type NextAction =
  | { kind: "resume"; id: string; mode: string; title: string; done: number; total: number }
  | { kind: "plan"; label: string }
  | { kind: "mistakes"; count: number }
  | { kind: "weak"; subject: string; chapter: string; accuracy: number; answered: number }
  | { kind: "start"; firstRun: boolean };

/** One next step, in priority order: unfinished attempt, today's plan task, mistakes due, weakest chapter, quick start. */
export function chooseNextAction(i: NextActionInput): NextAction {
  if (i.resume) return { kind: "resume", ...i.resume };
  if (i.firstRun) return { kind: "start", firstRun: true };
  if (i.plan) return { kind: "plan", label: i.plan.label };
  if (i.mistakesDue > 0) return { kind: "mistakes", count: i.mistakesDue };
  if (i.weak) return { kind: "weak", ...i.weak };
  return { kind: "start", firstRun: false };
}

/** Short name for a study-plan task, from fields the plan view already carries. */
export function planTaskLabel(it: Pick<ItemView, "kind" | "chapterName">): string {
  const ch = it.chapterName;
  switch (it.kind) {
    case "PRACTICE":
      return ch ? `Practise ${ch}` : "Practice session";
    case "TIMED":
      return ch ? `Timed drill · ${ch}` : "Timed drill";
    case "MISTAKES":
      return ch ? `Redo mistakes · ${ch}` : "Redo mistakes";
    case "CHECKPOINT":
      return "Checkpoint";
    case "PROBLEMS":
      return ch ? `Problems · ${ch}` : "Library problems";
    case "REVIEW_DIAGNOSTIC":
      return "Review your diagnostic";
    default:
      return "Today's task";
  }
}

/** First unfinished task of today in a plan view, or null when nothing is due (finished, light day, locked). */
export function todaysPlanTask(plan: { locked: boolean; days: number; todayIndex: number; plan: { index: number; light: boolean; items: ItemView[] }[] } | null): ItemView | null {
  if (!plan || plan.locked || plan.todayIndex >= plan.days) return null;
  const day = plan.plan.find((d) => d.index === plan.todayIndex);
  if (!day || day.light) return null;
  return day.items.find((it) => !it.completedAt) ?? null;
}
