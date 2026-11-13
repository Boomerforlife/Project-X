# Weekly usage runbook (free-tier tracking)

Purpose: catch cost/limit problems before the upgrade triggers in `docs/COST_STRATEGY.md` section 5 fire.
Run weekly, record in a dated log (e.g. `usage-log.md` kept outside the repo or in a private note). Read-only checks.

| Check | How | Free allowance (re-verify on vendor page) | Trigger (7-day sustained) |
|---|---|---|---|
| DB size | `select pg_size_pretty(pg_database_size(current_database()));` | 500 MB | > 350 MB: consider Supabase Pro |
| Largest tables | `select relname, pg_size_pretty(pg_total_relation_size(oid)) from pg_class where relkind='r' and relnamespace='public'::regnamespace order by pg_total_relation_size(oid) desc limit 10;` | - | one table > 40% of DB: prune/narrow |
| AI spend | `npm run ai -- budget` and `select * from usage_counters where day >= current_date - 7 and metric like 'ai.%';` | `AI_DAILY_BUDGET_USD` | calls hitting the cap daily: review prompts, move to paid key |
| Workers requests | Dashboard > Workers > projectx-api > Metrics | 100k req/day, 10 ms CPU | > 70k/day or CPU errors: Workers Paid |
| Cache hit ratio | Dashboard > Caching > Analytics (or Workers metrics) | - | public hit ratio < 80%: check `Cache-Control`/tags/Vary/Authorization on SSR calls |
| R2 storage / ops | Dashboard > R2 > each bucket metrics | 10 GB-month, 1M Class A, 10M Class B | > 8 GB: review `derived/` retention |
| Rate limiting | Dashboard > Security > Events | - | many 429s for real users: raise class limits in `wrangler.toml` |
| Supabase egress/MAU | Dashboard > Settings > Usage | ~5 GB egress, 50k MAU | approaching either |
| Backups | latest `backups/YYYY-MM-DD/db.sql.gz` exists | - | older than 8 days: run `backup-runbook.md` |

Log template:
```
YYYY-MM-DD  db=__MB  top-table=__  ai.calls=__ ai.cost=$__  workers=__/day  hit=__%  r2=__GB  429s=__  backup=YYYY-MM-DD  notes=
```
