# Backup runbook (free tier: weekly `pg_dump` to private R2)

All steps run on the operator machine and REQUIRE APPROVAL before touching production. Supabase Pro includes daily
backups, in which case this is a secondary copy.

## Weekly dump
1. Use the **direct** connection or the session pooler (not the transaction pooler) for `pg_dump`:
   `pg_dump "$DATABASE_URL_DIRECT" --no-owner --no-privileges --schema=public --schema=app_private | gzip > db.sql.gz`
   (`DATABASE_URL_DIRECT` is only set in your shell for this task; do not store it in `.env`.)
2. Upload to the private source bucket under the key from `r2Keys.backup(date)` = `backups/YYYY-MM-DD/db.sql.gz`:
   `wrangler r2 object put projectx-source-docs/backups/2026-11-14/db.sql.gz --file db.sql.gz --content-type application/gzip`
3. Verify: `wrangler r2 object get projectx-source-docs/backups/2026-11-14/db.sql.gz --file check.sql.gz` and `gzip -t check.sql.gz`.
4. Retention: keep the last 8 weekly dumps; delete older with `wrangler r2 object delete ...`. A dump is ~ DB size / 5 compressed.

## Restore drill (quarterly, against a scratch Supabase project or local Postgres, never production first)
1. `gunzip -c db.sql.gz | psql "$SCRATCH_URL"`; apply nothing else.
2. Run `npm run test:rls -w @projectx/db -- --url $SCRATCH_URL` to confirm RLS and grants survived.
3. Record date, size, duration in `usage-runbook.md` log.

## Notes
* Dumps contain user data (profiles, attempts, doubts). Keep them in the private bucket only; never in public assets.
* Auth users live in the `auth` schema (not dumped above). Rely on Supabase backups for auth; document the gap in the log.
