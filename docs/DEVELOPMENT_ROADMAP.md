# ProjectX — Development Roadmap (Owner B)

| Milestone | Deliverables | Exit criteria (all offline unless noted) |
|---|---|---|
| **M0 Planning** (done) | docs/ARCHITECTURE, DATABASE_SCHEMA, API_CONTRACTS, AI_PIPELINE, INGESTION_PIPELINE, COST_STRATEGY | docs reviewed; open questions answered (WORK_SPLIT §8, in git history; current status in docs/LAUNCH_READINESS.md) |
| **M1 Foundations** (parallel W0→W1..W5) | W0 bootstrap; W1 migrations+seed+shim+RLS tests+db package+types; W2 contracts+shared; W5 edge package+wrangler+.env.example | `npm run typecheck` and `npm test` green for db, database-types, contracts, shared, edge; all migrations apply on fresh PGlite; RLS suite green |
| **M2 API** | W2 all routes on memory repos, then SQL repos on PGlite; OpenAPI committed; mock server for Owner A | API unit + integration suites green; openapi.json generated; `wrangler deploy --dry-run` succeeds; Owner A can run `npm run dev -w @projectx/api` |
| **M3 AI pipeline** | W3 Gemini client+mock, modules, verification rules, SymPy bridge, CLI | AI tests (mock) + sympy pytest green; e2e classify→solve→verify on PGlite fixtures |
| **M4 Ingestion** | W4 pxw CLI: register, process-document, parse-answer-key, OCR chain, dedupe, job runner | pytest green; synthetic NTA-style PDF → source_questions → promote → AI_CLASSIFY job present (via db:serve) |
| **M5 Integration** | Lead: cross-package e2e script (`scripts/e2e-local` in orchestrator scope): register synthetic doc → pxw → ai mock → admin approve → publish → public GET → practice attempt → streak | one command passes locally; RLS suite rerun; security checklist (ARCHITECTURE §7) ticked |
| **M6 Staging (live on Cloud Run + Supabase)** | Supabase project, GCP project, Gemini key | `supabase db push --remote` to staging; Cloud Run deploys (see docs/DEPLOYMENT_GCP.md); smoke tests (`SET LOCAL ROLE authenticated` works through pooler; JWKS verify); first licensed source approved; small real batch (≤50 questions) through AI with paid-or-free key under budget |
| **M7 Launch hardening** | WAF rule, rate-limit tuning, backups runbook, sitemap opt-in workflow, monitoring checklist | Lighthouse/SEO handled by Owner A; our p95 public miss < 300 ms; cache hit > 90 % |
| Done after M6 | Tabby Plus billing (Razorpay live) and premium entitlements (migrations 0018, 0026); study plans (0024) | docs/MONETIZATION_HANDOVER.md |
| Later | JEE Advanced / NEET taxonomy+question types (`MATRIX_MATCH`, partial marking), mocks, AI doubt answering (separate budgeted job, never auto-public), Gemini vision transcription for math-heavy scans | schema already leaves room (enums extendable, `access_tier`, `marking_scheme`) |

Non-negotiables at every milestone: no secrets committed, no remote/paid/deploy actions without explicit approval, report actual test output,
never fabricate PYQs/sources/keys (dev fixtures are labelled synthetic and excluded from prod seed).
