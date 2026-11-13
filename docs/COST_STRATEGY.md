# ProjectX — Cost Strategy

Goal: run at ₹0 until real traffic, with measured, documented upgrade triggers. Free-tier figures below are the commonly published limits;
**re-check the vendor pricing pages before any upgrade decision** (they change).

## 1. Free-tier budget map
| Resource | Free allowance (approx.) | Our main consumer | Mitigation |
|---|---|---|---|
| Supabase DB | 500 MB, project pauses after ~7 days idle | questions+solutions (~10–20 KB/question incl. versions), attempts (~200 B/row + indexes) | parsed AI output only (no raw transcripts), prune superseded AI runs' `output` after 90 days, attempts are narrow, no blobs in DB |
| Supabase Auth | 50k MAU | students | — |
| Supabase egress | ~5 GB/mo | API reads on cache misses | edge cache (§2) means DB egress ≈ misses only |
| Workers | 100k requests/day, 10 ms CPU/request | all API calls incl. cache hits served by Workers Caching | cache static-ish data in Owner A's HTML cache too; keep per-request CPU tiny (no AI, JWT verify + one query) |
| R2 | 10 GB-month, 1M Class A, 10M Class B ops/month, **$0 egress** | PDFs, crops, public assets | content-addressed immutable public assets (`Cache-Control: public, max-age=31536000, immutable`) so CDN absorbs reads |
| Cache purge | all purge methods on all plans; free-tier rate limits | admin publish actions | purge by tag, batched per action (≤ 10 tags), never purge-everything automatically |
| Workers Rate Limiting / WAF | binding included; 1 free WAF rate-limit rule | abuse | per-route limits (API_CONTRACTS §1) |
| Gemini | free tier is rate-limited; free-tier prompts may be used by Google to improve products | AI pipeline (batch) | only public exam content is ever sent (no PII); move to paid key before processing licensed/partner content |

## 2. Caching (largest lever)
* Public GETs are cacheable for everyone (no auth variance): `s-maxage` 1 h (content) / 24 h (taxonomy) with `stale-while-revalidate`, purge by tag on
  every editorial change (exact tag map in API_CONTRACTS §1). Expected hit ratio on SEO pages > 90 % → DB sees < 10 % of public traffic.
* Owner A's SSR HTML should also be CDN-cached with our `X-Cache-Tags` copied to its `Cache-Tag`, so most page views never reach our Worker.
* Never cache authenticated responses (`private, no-store`); student traffic is small rows, single indexed queries.

## 3. AI cost controls
1. Batch only (CLI), never per user request. 2. Cache by `input_hash` (identical inputs never billed twice). 3. Model tiering: FAST for classify/quality/SEO,
STRONG for solve/answer/critique. 4. Skip stages: official-key questions still get critique, but SEO only after PASSED; alternatives only on demand.
5. Hard caps: `AI_DAILY_BUDGET_USD` (default 1.00) and `AI_MAX_CALLS_PER_RUN` (200), enforced before each call from `usage_counters`. 6. Token caps per
task (AI_PIPELINE §3). 7. Estimated per question ≈ 6 calls (classify, quality, solve, answer, critique, seo); log real `cost_usd_micros` per run and review
weekly via `npm run ai -- budget`.

## 4. Tracking (no paid observability)
* `usage_counters(day, metric)`: `ai.calls`, `ai.cost_usd_micros`, `ai.input_tokens`, `ai.output_tokens`, `ingestion.pages`, `ingestion.ocr_pages`, `api.attempts`.
* Weekly ops script (W5 `infra/cloudflare/README` runbook): `select pg_database_size(current_database())`, top table sizes, R2 bucket sizes (dashboard), Workers
  request analytics (dashboard), cache hit ratio. Record in a dated log.

## 5. Upgrade triggers (decide, don't auto-scale)
| Trigger (sustained 7 days) | Action | Cost |
|---|---|---|
| DB size > 350 MB, or project pausing hurts, or need daily backups/PITR | Supabase Pro | ~$25/mo |
| Workers > 70k requests/day, or CPU-limit errors | Workers Paid | ~$5/mo base |
| Many cold DB connections from Workers / p95 DB latency > 300 ms | enable Hyperdrive binding (adapter already supported) | plan-dependent |
| Gemini free-tier rate limits block daily batch, or licensed content | paid Gemini key with the same caps | per token |
| R2 > 8 GB | review retention of derived page renders (keep originals + crops only) | ~$0.015/GB-mo beyond free |

## 6. Things we deliberately do not pay for
Redis, Elasticsearch/vector DB (Postgres FTS + pg_trgm), queues (Postgres job table), always-on workers (CLIs on demand), image CDN products
(pre-sized PNG/WebP crops), APM (JSON logs + Workers logs).
