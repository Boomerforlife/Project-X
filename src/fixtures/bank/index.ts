/**
 * MOCK FIXTURE — the full sample question bank: hand-written items plus
 * deterministic generated variants. Built lazily and memoised so importing
 * this module costs nothing until content is actually needed.
 */
import type { Hint, Question, Solution } from "@/contracts";
import { questions as handQuestions, solutions as handSolutions } from "../questions";
import { biologyTemplates } from "./biology";
import { chemistryTemplates } from "./chemistry";
import { generate, type Template } from "./engine";
import { mathematicsTemplates } from "./mathematics";
import { physicsTemplates } from "./physics";

export const TEMPLATES: Template[] = [...physicsTemplates, ...chemistryTemplates, ...mathematicsTemplates, ...biologyTemplates];

type Bank = { questions: Question[]; solutions: Solution[]; hints: Hint[]; templateOf: Map<string, string> };

let bank: Bank | null = null;

export function getBank(): Bank {
  if (bank) return bank;
  const questions: Question[] = [...handQuestions];
  const solutions: Solution[] = [...handSolutions];
  const hints: Hint[] = handQuestions.map((q) => ({
    questionId: q.id,
    body: "Write down the governing relation for this topic before substituting any numbers.",
    generatedBy: "ai" as const,
  }));
  const templateOf = new Map<string, string>();
  for (const q of handQuestions) templateOf.set(q.id, `hand_${q.id}`);
  for (const t of TEMPLATES) {
    for (const g of generate(t)) {
      questions.push(g.question);
      solutions.push(g.solution);
      hints.push(g.hint);
      templateOf.set(g.question.id, t.key);
    }
  }
  bank = { questions, solutions, hints, templateOf };
  return bank;
}
