# ProjectX — Cost Strategy

Goal: run at near-zero cost until real traffic, with measured, documented upgrade triggers. Free-tier figures below are the commonly published limits;
**re-check the vendor pricing pages before any upgrade decision** (they change).

## 1. Free-tier budget map
| Resource | Free allowance (approx.) | Our main consumer | Mitigation |
|---|---|---|---|
| Supabase DB | 500 MB, project pauses after ~7 days idle | questions+solutions (~10–20 KB/question incl. versions), attempts (~200 B/row + indexes) | parsed AI output only (no raw transcripts), prune superseded AI runs' `output` after 90 days, attempts are narrow, no blobs in DB |
| Supabase Auth | 50k MAU | students | — |
| Supabase egress | ~5 GB/mo | API reads on cache misses | edge cache (§2) means DB egress ≈ misses only |
| Cloud Run (`projectx-api`, `projectx-web`) | has a free tier (check the current limits) | API and web requests | scale to zero; precompiled `dist/server.mjs` and `--cpu-boost` keep cold starts short; no AI in requests |
| Firebase Hosting | has a free tier (check the current limits) | web traffic through `tabbyprep.in` | CDN caches by `s-maxage`; a new release (`infra/gcp/firebase-hosting.sh deploy`) clears it |
| Cloud Storage (3 buckets) | check current pricing | PDFs, crops, public assets | content-addressed immutable public assets (`Cache-Control: public, max-age=31536000, immutable`) |
| Rate limiting | no extra service | abuse | per-route limits (API_CONTRACTS §1): in memory per instance, plus Postgres for the write/attempt/doubt/admin classes |
| GCP billing alert | about USD 5 / ₹450 on the project | any overspend | alerts only; it does not stop spending |
| Gemini | free tier is rate-limited; free-tier prompts may be used by Google to improve products | AI pipeline (batch) | only public exam content is ever sent (no PII); move to paid key before processing licensed/partner content |

## 2. Caching (largest lever)
* Public GETs are cacheable for everyone (no auth variance): `s-maxage` 1 h (content) / 24 h (taxonomy) with `stale-while-revalidate`. The web app caches them
  with Next tags and the API calls its revalidate webhook on editorial changes (tag map in API_CONTRACTS §1); Firebase Hosting's CDN honours `s-maxage`
  and is cleared by a new Hosting release. Goal: most public traffic never reaches the DB.
* Never cache authenticated responses (`private, no-store`); student traffic is small rows, single indexed queries.

## 3. AI cost controls
1. Batch only (CLI), never per user request. 2. Cache by `input_hash` (identical inputs never billed twice). 3. Model tiering: FAST for classify/quality/SEO,
STRONG for solve/answer/critique. 4. Skip stages: official-key questions still get critique, but SEO only after PASSED; alternatives only on demand.
5. Hard caps: `AI_DAILY_BUDGET_USD` (default 1.00) and `AI_MAX_CALLS_PER_RUN` (200), enforced before each call from `usage_counters`. 6. Token caps per
task (AI_PIPELINE §3). 7. Estimated per question ≈ 6 calls (classify, quality, solve, answer, critique, seo); log real `cost_usd_micros` per run and review
weekly via `npm run ai -- budget`.

## 4. Tracking (no paid observability)
* `usage_counters(day, metric)`: `ai.calls`, `ai.cost_usd_micros`, `ai.input_tokens`, `ai.output_tokens`, `ingestion.pages`, `ingestion.ocr_pages`, `api.attempts`.
* Weekly check: `select pg_database_size(current_database())`, top table sizes, bucket sizes and Cloud Run request/instance metrics (GCP console), billing report. Record in a dated log.

## 5. Upgrade triggers (decide, don't auto-scale)
| Trigger (sustained 7 days) | Action | Cost |
|---|---|---|
| DB size > 350 MB, or project pausing hurts, or need daily backups/PITR | Supabase Pro | ~$25/mo |
| Sustained cold starts hurting users, or request volume nearing the Cloud Run / Firebase Hosting free tiers | set a minimum instance count on `projectx-api` / `projectx-web`, or accept paid usage | per Google Cloud pricing |
| Supabase free-tier limits (DB size, egress, pausing) | Supabase Pro (as above) | ~$25/mo |
| p95 DB latency > 300 ms | review pooler use and queries first | n/a |
| Gemini free-tier rate limits block daily batch, or licensed content | paid Gemini key with the same caps | per token |
| Bucket storage growing | review retention of derived page renders (keep originals + crops only) | per Cloud Storage pricing |

## 6. Things we deliberately do not pay for
Redis, Elasticsearch/vector DB (Postgres FTS + pg_trgm), queues (Postgres job table), always-on workers (CLIs on demand), image CDN products
(pre-sized PNG/WebP crops), APM (JSON logs + Cloud Run logs).
