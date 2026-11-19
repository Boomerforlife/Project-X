# ProjectX — AI Pipeline (binding; package `@projectx/ai`, owner W3)

AI never runs inside API requests. A Node CLI claims `AI_*` jobs from `pipeline_jobs`, calls Gemini (server-side key) or the
mock, writes `ai_runs`, `solution_versions`, `verification_runs/checks`, and updates question statuses. **AI output alone is never
"verified"**: the best automatic status is `AUTOMATED_CHECKS_PASSED` or `OFFICIAL_KEY_MATCHED`; only a human sets `HUMAN_VERIFIED`.

## 1. Package layout
```
packages/ai/src/
  index.ts                 public exports
  gemini/client.ts         GeminiClient interface + types
  gemini/google.ts         createGeminiClient (@google/genai 2.32.0)
  gemini/mock.ts           createMockGeminiClient (fixtures + handlers)
  gemini/budget.ts         withBudget(client, BudgetStore) decorator
  prompts/<task>.v1.ts     prompt definitions (id, version, system, render)
  schemas/*.ts             Zod output schemas (below) + toJsonSchema helpers
  modules/{classify,answer,solve,alternatives,critique,quality,seo}.ts
  verify/rules.ts          decideVerification (pure)  verify/checks.ts  verify/sympy.ts (SympyChecker)
  pipeline/runner.ts       job loop; pipeline/handlers/{classify,solve,verify,seo}.ts
  repo/ai-repo.ts          AiRepository interface + SQL impl over @projectx/db SqlTx
  cli.ts                   entry (tsx)
packages/ai/fixtures/       mock responses keyed by task + fixture question slug
workers/src/pxw/verification/sympy_check.py   (Python, owned by W3)
```

## 2. Gemini client interface
```ts
export type ModelTier = 'FAST' | 'STRONG';
export interface StructuredRequest<T> {
  task: AiTask; tier: ModelTier; system: string; prompt: string;
  images?: { mimeType: 'image/png'|'image/jpeg'|'image/webp'; base64: string }[];
  schema: z.ZodType<T>;             // validated after the call
  jsonSchema: Record<string, unknown>; // z.toJSONSchema(schema) post-processed (see §3 rules)
  temperature?: number;             // default 0.2 (CLASSIFY/ANSWER 0)
  maxOutputTokens?: number;         // default per task (§3)
  timeoutMs?: number;               // default 60000
}
export type StructuredResult<T> =
  | { ok: true; value: T; model: string; usage: { inputTokens: number; outputTokens: number }; latencyMs: number }
  | { ok: false; error: { kind: 'SCHEMA_INVALID'|'TRANSPORT'|'RATE_LIMITED'|'SAFETY_BLOCKED'|'TIMEOUT'|'BUDGET_EXCEEDED'; message: string; raw?: string };
      model: string; usage?: { inputTokens: number; outputTokens: number }; latencyMs: number };
export interface GeminiClient { readonly provider: 'gemini'|'mock'; generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>; }
```
* `createGeminiClient({ apiKey, models: { FAST, STRONG } })` → `ai.models.generateContent({ model, contents, config: { systemInstruction,
  responseMimeType: 'application/json', responseJsonSchema, temperature, maxOutputTokens } })`; parse `response.text` as JSON → `schema.safeParse`;
  one automatic repair retry on SCHEMA_INVALID (append the Zod issues to the prompt); HTTP 429 → `RATE_LIMITED` with backoff 2^n s (max 3);
  usage from `usageMetadata.promptTokenCount/candidatesTokenCount`.
* `createMockGeminiClient({ fixturesDir?, handlers?: Partial<Record<AiTask, (req) => unknown>> })`: deterministic; resolves output by
  `handlers[task]` else fixture file `fixtures/<task>/<sha256(prompt).slice(0,16)>.json` else a schema-valid default generator; usage = chars/4.
* `withBudget(client, store)`: before each call checks `usage_counters(day, 'ai.cost_usd_micros')` + estimate ≤ `AI_DAILY_BUDGET_USD` and
  per-run call count ≤ `AI_MAX_CALLS_PER_RUN`; else `BUDGET_EXCEEDED` (job re-queued with run_after = next UTC day). Cost table per model in
  `gemini/pricing.ts` (USD per 1M input/output tokens; values configurable; unknown model → treat as STRONG price).
* `AI_PROVIDER=gemini` without `GEMINI_API_KEY` → falls back to mock with a WARN log; `APP_ENV=production` + mock → refuse to start.

## 3. Structured output schemas (`packages/ai/src/schemas`)
JSON Schema rules for Gemini: only `type, properties, required, items, enum, minimum, maximum, minItems, maxItems, description, nullable via
type:['x','null']`; no `$ref`, no `oneOf`/`anyOf`, flat ≤ 4 levels; length limits enforced by Zod after the call (Gemini ignores min/maxLength).
Options are referenced by **label** (`A`..`E`) in all AI I/O; code maps labels ↔ option ids.

```ts
AiAnswer = { kind: 'OPTIONS'|'NUMERIC', labels: OptionLabel[] /*[] for NUMERIC*/, value: string|null /*decimal for NUMERIC*/ }
ClassificationOutput = { subject_code: SubjectCode, chapter_slug: string, topic_slug: string|null, difficulty: Difficulty,
  question_type: QuestionType, confidence: number /*0..1*/, rationale: string /*≤300*/ }          // tier FAST, maxOutputTokens 512
AnswerOutput = { answer: AiAnswer, confidence: number, brief_reasoning: string /*≤600*/ }          // blind; tier STRONG, 1024
SolutionOutput = { answer: AiAnswer, summary: string /*≤600*/,
  steps: { title: string|null, text: string /*≤2000, inline LaTeX*/, display_math: string|null }[] /*1..15*/,
  formulas: { name: string, latex: string }[] /*≤10*/, concepts: string[] /*≤8*/, shortcuts: string[] /*≤5*/, common_mistakes: string[] /*≤5*/,
  sympy_checks: { kind: 'NUMERIC_EVAL'|'SYMBOLIC_EQUIV', expression: string, compare_to: string, variables: { name: string, value: string }[] }[] /*≤3*/ }
                                                                                                  // tier STRONG, 4096
AlternativesOutput = { alternatives: { title: string, steps: SolutionOutput['steps'] }[] /*≤2*/ }  // optional, STRONG, 3072
CritiqueOutput = { verdict: 'CORRECT'|'INCORRECT'|'UNSURE', recomputed_answer: AiAnswer|null,
  issues: { severity: 'MINOR'|'MAJOR', step_index: number|null, description: string /*≤400*/ }[] /*≤10*/ }  // STRONG (different prompt, temp 0), 2048
QualityOutput = { is_complete: boolean, is_ambiguous: boolean, ocr_errors_suspected: boolean, missing_figure: boolean,
  issues: string[] /*≤8*/ }                                                                       // FAST, 512
SeoOutput = { title: string /*≤60*/, description: string /*≤155*/, keywords: string[] /*≤8*/ }     // FAST, 512
```
Conversion: `SolutionOutput` → `solution_versions` row: steps → `{index, title, blocks:[paragraph(text), math(display_math)?]}`;
`answer` → `AnswerKey` via option-label map (canonicalised: sorted ids); NUMERIC answer → `accepted_ranges:[{min:value,max:value}]`,
`display_value:value` (tolerance only from official key or human). `provenance='AI_GENERATED'`, `ai_run_id` set.

## 4. Prompts & idempotency
* Prompt module: `{ id: 'solve', version: 'v1', system: string, render(input): string }`; `prompt_version` stored on `ai_runs`. Inputs never
  include user PII; only question content (text/LaTeX, option texts, optional figure images from PUBLIC/SOURCE assets), taxonomy candidate
  list (for CLASSIFY: all active chapters/topics of the exam as `slug: name` lines), and for SOLVE the official key if present
  ("The official answer is B. Explain…"). ANSWER and CRITIQUE never see the official key or the solver's answer (independence).
* `input_hash = sha256(canonicalJson({ task, prompt_id, prompt_version, model, inputs }))`. Before calling, `AiRepository.findSucceededRun(task,
  input_hash)` → reuse output (no cost). Unique partial index guarantees one SUCCEEDED run per hash.
* Job idempotency keys: `AI_CLASSIFY:{qid}:{content_hash}`, `AI_SOLVE:{qid}:{content_hash}:{solve.version}`, `AI_VERIFY:{qid}:{solution_version_id}:{rules_version}`,
  `AI_SEO:{qid}:{current_solution_id}`; admin `force` appends `:force-{epochSeconds}`.

## 5. SymPy bridge
```ts
export interface SympyCheckRequest { id: string; kind: 'NUMERIC_EVAL'|'SYMBOLIC_EQUIV'; expression: string; compare_to: string;
  variables: Record<string, string>; rel_tolerance: number /*default 1e-6; numeric answers compared with key range if present*/ }
export interface SympyCheckResult { id: string; status: 'PASS'|'FAIL'|'INCONCLUSIVE'|'ERROR'; computed: string|null; message: string|null }
export interface SympyChecker { check(reqs: SympyCheckRequest[]): Promise<SympyCheckResult[]> }
createPythonSympyChecker({ pythonBin, timeoutMs, cwd: '<repo>/workers' })  // spawns `python -m pxw.verification.sympy_check`
createMockSympyChecker(results?: Record<string, SympyCheckResult['status']>)
```
Python CLI protocol: stdin = JSON array of requests, stdout = JSON array of results (same order), exit 0; any crash → all ERROR. Safety:
expressions must match `^[A-Za-z0-9_+\-*/^().,\s]{1,500}$`, identifiers allowed = declared variables ∪ allow-list {`pi,E,sqrt,sin,cos,tan,asin,acos,atan,
log,ln,exp,Abs,Rational,Integer`}; parse with `sympy.parsing.sympy_parser.parse_expr(expr, local_dict=…, global_dict={}…, transformations=standard+implicit_multiplication+convert_xor)`
only after the regex/identifier check; per-batch wall timeout `SYMPY_TIMEOUT_MS` (subprocess killed). NUMERIC_EVAL: evaluate with variables → compare to
`compare_to` (rel tol). SYMBOLIC_EQUIV: `simplify(expr - compare_to) == 0` → PASS; non-zero numeric → FAIL; undecidable/timeout → INCONCLUSIVE.

## 6. Status state machines

**ingestion_status (questions):** `IMPORTED --classify ok--> CLASSIFIED --solve ok--> SOLVED --verify run done--> CHECKED`;
any stage DEAD job or QUALITY says incomplete → `NEEDS_ATTENTION` (admin fixes content → PATCH resets to IMPORTED and re-enqueues).
**Stage chaining (handlers enqueue next):** AI_CLASSIFY → (QUALITY inline; if `is_complete && !is_ambiguous`) AI_SOLVE → AI_VERIFY → (if outcome PASSED) AI_SEO.
CLASSIFY with confidence < 0.7 still proceeds but records the check (§7) and may block auto-pass. CLASSIFY fills subject/chapter/topic/difficulty
**only where the column is null** (never overwrites values set by ingestion or humans); `question_type` from AI is advisory only (mismatch → QUALITY issue).
**Difficulty provenance:** every writer of `questions.difficulty` must set the transaction-local settings `app.difficulty_source` (`'AI'` or `'IMPORT'` for automated writers) and `app.difficulty_set_by`. Migration `0026` records them in `questions.difficulty_source`, `difficulty_set_by` and `difficulty_set_at` through the trigger `questions_difficulty_meta`. A human classification (`ADMIN`, made in the web UI at `/admin/questions/`) is the reviewed one.

**verification_status:**
```
PENDING ──verify──▶ AUTOMATED_CHECKS_PASSED | OFFICIAL_KEY_MATCHED | HUMAN_REVIEW_REQUIRED | DISPUTED
AUTOMATED_CHECKS_PASSED | OFFICIAL_KEY_MATCHED | HUMAN_REVIEW_REQUIRED ──admin approve──▶ HUMAN_VERIFIED
any ──admin dispute / key conflict──▶ DISPUTED ──admin approve (ADMIN)──▶ HUMAN_VERIFIED
HUMAN_VERIFIED ──content edit──▶ HUMAN_REVIEW_REQUIRED ;  any non-HUMAN_VERIFIED ──re-verify──▶ (re-decided)
HUMAN_VERIFIED is never changed by the AI pipeline (AI_VERIFY on a HUMAN_VERIFIED question only records a run, resulting_status = unchanged)
```
**publication_status:** `DRAFT ⇄ PUBLISHED` (admin; guard), `DRAFT|PUBLISHED → ARCHIVED → DRAFT (restore)`; DISPUTED forces PUBLISHED→DRAFT.
**pipeline job:** `QUEUED → RUNNING → SUCCEEDED | QUEUED (retry, backoff) | DEAD`; `QUEUED|RUNNING → CANCELLED`; lease expiry re-claims.
**ai_runs.status:** SUCCEEDED | FAILED (transport/timeout) | SCHEMA_INVALID (after repair retry) | BLOCKED (safety). Non-success → job `fail(retryable = kind∈{TRANSPORT,RATE_LIMITED,TIMEOUT})`.

## 7. Verification checks and decision rules (`rules_version = 'v1'`, pure function `decideVerification(input) → {outcome, status, reasons[]}`)

Checks recorded per run (`verification_checks`, one per kind):
| kind | How | PASS / FAIL / INCONCLUSIVE / SKIPPED |
|---|---|---|
| CONTENT_COMPLETENESS | QualityOutput + structural: MCQ has 2–5 options, NUMERICAL none, no unresolved `asset_ref`, text non-empty | complete & not ambiguous / otherwise / — / — |
| CLASSIFICATION_CONFIDENCE | latest ClassificationOutput.confidence | ≥0.7 / <0.4 / 0.4–0.7 / no classification |
| OFFICIAL_KEY_MATCH | `answerKeysEqual(solution.final_answer, questions.answer_key)` when answer_key_source=OFFICIAL | equal / differ / — / no official key |
| INDEPENDENT_ANSWER_AGREEMENT | fresh ANSWER run (blind) vs solution answer; NUMERIC compares within key range or rel 1e-3 | agree / disagree / AnswerOutput.confidence<0.5 / — |
| SYMPY_CHECK | run `solution_versions.sympy_checks` | all PASS / any FAIL / any INCONCLUSIVE or ERROR / none proposed |
| AI_CRITIQUE | CRITIQUE run on solution | verdict CORRECT and no MAJOR issue / INCORRECT or any MAJOR / UNSURE / — |

Decision (first matching rule wins; `reasons` = codes of every non-PASS check + rule code):
1. Official key exists and `is_dropped` → **HUMAN_REVIEW_REQUIRED** (`DROPPED_BY_EXAM_BODY`), outcome NEEDS_REVIEW.
2. CONTENT_COMPLETENESS ≠ PASS → **HUMAN_REVIEW_REQUIRED** (`CONTENT_INCOMPLETE`), outcome FAILED; ingestion_status NEEDS_ATTENTION.
3. Official key exists and OFFICIAL_KEY_MATCH = FAIL:
   a. INDEPENDENT_ANSWER_AGREEMENT = PASS with the *solver's* answer, both blind answers ≠ key, and SYMPY_CHECK = PASS → **DISPUTED** (`KEY_CONFLICT_STRONG`), FAILED.
   b. otherwise → **HUMAN_REVIEW_REQUIRED** (`OFFICIAL_KEY_MISMATCH`), FAILED.
4. Official key exists and OFFICIAL_KEY_MATCH = PASS: if AI_CRITIQUE = FAIL or SYMPY_CHECK = FAIL → **HUMAN_REVIEW_REQUIRED** (`SOLUTION_QUALITY`),
   NEEDS_REVIEW; else → **OFFICIAL_KEY_MATCHED**, PASSED (independent answer disagreement is recorded but only flags the reason `BLIND_ANSWER_DISAGREES`).
5. No official key: **AUTOMATED_CHECKS_PASSED**, PASSED iff INDEPENDENT_ANSWER_AGREEMENT = PASS and AI_CRITIQUE = PASS and SYMPY_CHECK ∈ {PASS, SKIPPED}
   and CLASSIFICATION_CONFIDENCE = PASS (SKIPPED counts as FAIL); any FAIL → **HUMAN_REVIEW_REQUIRED** FAILED; else (INCONCLUSIVE) → HUMAN_REVIEW_REQUIRED NEEDS_REVIEW.
6. Pipeline errors (job DEAD at any AI stage) → status **HUMAN_REVIEW_REQUIRED**, reason `PIPELINE_ERROR`, ingestion_status NEEDS_ATTENTION.
7. Question currently HUMAN_VERIFIED → record run, `resulting_status` = HUMAN_VERIFIED (unchanged); if the run would be FAILED, add reason
   `REVERIFY_REGRESSION` and enqueue nothing (surfaced in admin queue filter).
Answer-key side effect: rule 5 PASSED with no key → `questions.answer_key` remains **null** (AI_CONSENSUS keys are stored on the solution only);
the admin approve step sets the key. (Practice only serves published questions, which always have a key.)
Each run: insert `verification_runs` (+checks) and update `questions.verification_status`, `ingestion_status='CHECKED'` in one `withService` txn;
`review_events` is **not** written by the pipeline (it records human decisions only); `audit_log` gets actor_type WORKER.

## 8. CLI (`npm run ai -w @projectx/ai -- <cmd>`)
```
run-worker [--kinds AI_CLASSIFY,AI_SOLVE,AI_VERIFY,AI_SEO] [--max-jobs 50] [--worker-id ai-<host>] [--lease 600] [--once]
process-question --id <uuid> [--stages classify,solve,verify,seo]   # enqueue+run inline for one question
enqueue --kind AI_VERIFY --question <uuid> [--force]
budget                                                               # today's spend / caps from usage_counters
Global: --db pglite|postgres (default from DB_DRIVER), --provider mock|gemini (default AI_PROVIDER), --dry-run (no DB writes)
```
Exit codes: 0 ok, 2 config error, 3 budget exhausted, 1 other. Logs JSON lines to stdout. Heartbeat every lease/3.

## 9. Tests required (offline)
Mock client only (network disabled by default: `createGeminiClient` throws if `APP_ENV=test`). Cover: schema validation + repair retry, budget
decorator, label↔id mapping, every decision rule row (table-driven), HUMAN_VERIFIED immutability, idempotent reuse by input_hash, job chaining,
end-to-end on PGlite with dev fixtures (`createTestDb` from `@projectx/db/testing`): classify→solve→verify produces solution_versions v1 and a
verification_run; Python sympy tests (`pytest workers/tests/verification`): pass/fail/inconclusive/timeout/disallowed-identifier rejection.
