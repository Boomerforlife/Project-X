// One-off: export the JEE part of the sample bank for import (run with tsx from repo root).
import { readFileSync, writeFileSync } from "node:fs";
import { getBank } from "@/fixtures/bank";
const api = readFileSync(process.argv[2], "utf8").trim().split(/\r?\n/).flatMap((l) => JSON.parse(l).data as { slug: string; segment: string; name: string }[]);
const bySeg = new Map(api.map((c) => [c.segment, c]));
const ALIAS: Record<string, string> = {
  "limits-continuity-and-differentiability": "limit-continuity-and-differentiability",
  "classification-of-elements-and-periodicity": "classification-of-elements-and-periodicity-in-properties",
  "binomial-theorem": "binomial-theorem-and-its-simple-applications",
  "sequences-and-series": "sequence-and-series",
  "coordination-compounds": "co-ordination-compounds",
  "coordinate-geometry": "co-ordinate-geometry",
};
for (const [a, b] of Object.entries(ALIAS)) if (bySeg.has(b)) bySeg.set(a, bySeg.get(b)!);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const byName = new Map(api.map((c) => [norm(c.name), c]));
const bank = getBank();
const sol = new Map(bank.solutions.map((s) => [s.questionId, s]));
const rows: unknown[] = [];
const unmapped = new Map<string, number>();
for (const q of bank.questions) {
  if (!q.exams.includes("jee-main") || q.subject === "biology") continue;
  const c = bySeg.get(q.chapter) ?? byName.get(norm(q.chapter));
  if (!c) { unmapped.set(`${q.subject}/${q.chapter}`, (unmapped.get(`${q.subject}/${q.chapter}`) ?? 0) + 1); continue; }
  const s = sol.get(q.id);
  rows.push({ id: q.id, subject: q.subject, chapter_api: c.slug, chapter_seg: c.segment, type: q.type, difficulty: q.difficulty, stem: q.stem, options: q.options, answer: s?.answer, steps: s?.steps, assets: q.assets?.length ?? 0 });
}
writeFileSync(process.argv[3], rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log("exported", rows.length, "JEE questions; unmapped chapters:", JSON.stringify([...unmapped]));
