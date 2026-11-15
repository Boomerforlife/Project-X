# 2026-11-16: AI-checked JEE practice bank (live load)

What was loaded into the live Supabase DB (`public.questions` + `question_options` + `solution_versions`, one `audit_log`
row per question with action `content.import`, batch `editorial-bank-2026-11-16`):

- **433** JEE Main practice questions (physics 160, mathematics 161, chemistry 112; 43 chapters), from the project's own
  question bank (`src/fixtures/bank`: hand-written items plus deterministic templates whose answers are computed by code).
- Source `PROJECTX_AI` → `origin = AI_GENERATED`. Solutions `provenance = AI_GENERATED`, approved.
- **Check:** each question was solved blind by a separate model that saw only the stem and options (8 batches). Only questions where
  that answer matched the computed answer were loaded (433/433 answered agreed; 2 items without a stored answer were dropped).
  Hence `answer_key_source = AI_CONSENSUS`, `verification_status = AUTOMATED_CHECKS_PASSED` (shown to students as "AI-checked").
- Practice-only: `indexability = NOINDEX`, `sitemap_include = false`; the web adapter hides public question links for
  `AI_GENERATED` items. Publishing them is allowed by migration `0020_publish_ai_checked.sql` (owner decision).
- Not human-reviewed. Replace or upgrade with editorial or licensed, human-verified questions over time.

Reproduce (from the repo root):
1. `npx tsx --tsconfig tsconfig.json export-bank.ts <api-chapters.jsonl> .local/content/bank-jee.jsonl` (chapters from `GET /taxonomy/subjects/{slug}/chapters`)
2. Blind-solve batches, then `node compare.cjs` → `agreed-ids.json`
3. `PYTHONPATH=workers/src python gen_sql.py .local/content` → `sql/load-*.sql`, then `supabase db query --remote -f …` per file (idempotent on content_hash).
