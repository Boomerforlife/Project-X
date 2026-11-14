# ProjectX backend — status (Owner B), 2026-11-14

Branch `owner-b/backend-foundation` (local only; NOT pushed). Milestones M0–M5 built and verified **locally on PGlite with mocks**.

## Verified (actual runs)
typecheck clean · tests: contracts 10, shared 36, edge 30, db 246, ai 124, api 39 (TS) · Python 99 passed / 2 skipped (PG-optional; run separately and passed against local DB) · ruff clean · OpenAPI 3.1 (57 paths, 61 ops) generated · `wrangler deploy --dry-run` OK · ingestion e2e on local Postgres (synthetic PDF -> 5 questions promoted).
Opus review: no blockers; 4 HIGH + 5 MED findings fixed (migration 0014, API/AI hardening). See git log.

## NOT done / needs you (blocked on access or decisions)
1. Supabase: project ref + write-capable access needed to apply migrations 0001–0014 remotely (MCP was read-only). Nothing applied remotely.
2. Cloudflare: MCP token returned 403 on R2/Workers/zones; no R2 buckets, Worker, DNS or cache rules created. All steps in docs/DEPLOYMENT.md are "requires approval".
3. Never run for real: Gemini (no key; mock only), RapidOCR on real images, jwks auth verifier, Workers Caching purge API (feature-detected), Supabase pooler role switching (M6 smoke test).
4. Licensing: NTA source stays reuse_permitted=false; no real PYQs ingested or committed.
5. Known limitation: two source questions with byte-identical images share one question_assets row (needs a join table).
6. Syllabus seed (20/20/14 chapters) should be checked against the current NTA bulletin; Gemini model ids/prices are placeholders.
