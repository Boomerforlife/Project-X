# Deployment facts (verified 2026-11-15)

Hosting is GCP (Cloud Run + Firebase Hosting); see docs/DEPLOYMENT_GCP.md. This file covers Supabase only.

Input for the final cloud runbook. Each item is tagged:
**[V]** verified against the cited source on 2026-11-15 · **[U]** unverified or inferred, so test it on staging first.
Nothing here has been run against a real account.

Versions checked: Supabase CLI stable **v3.1.0** (2026-11-09; v4.0.0-next is a prerelease) · `@opennextjs/cloudflare` **1.20.17**
(peer deps: `next >=15.5.29 <16 || >=16.4.5`, `wrangler ^4.148.0`) · `wrangler` **4.162.0** · repo `next` 16.4.6.

---

## 1. Supabase

### 1.1 Project creation
- **[V]** Create the project in the dashboard. Get the project ref from `https://supabase.com/dashboard/project/<ref>`. Keep the DB password: the CLI needs it (`SUPABASE_DB_PASSWORD`). Source: https://supabase.com/docs/guides/deployment/managing-environments
- **[V]** Keys: use the publishable key (`sb_publishable_...`, safe in the browser) and the secret key (`sb_secret_...`, server only). The legacy `anon` and `service_role` keys are **deprecated by the end of 2026**. The web app already reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Source: https://supabase.com/docs/guides/getting-started/api-keys
- **[V]** Staging needs its own new project. A project that already has production's schema cannot be reused, because the CLI would apply the migrations again. Source: managing-environments (above).

### 1.2 Migrations with the CLI
- **[V] Docker is not needed for `db push` to a hosted project.** The handler connects to Postgres directly. It may call the Management API to mint a temporary login role. Docker is only needed for the local stack (`supabase start`, `db reset`, `db diff`). Source: CLI `apps/cli/src/commands/db/push/SIDE_EFFECTS.md` at tag v3.1.0, https://github.com/supabase/cli/tree/v3.1.0
- **[V] BREAKING in CLI v3: `supabase db push` targets the LOCAL database by default.** Pass `--remote` to push to the linked project. `--linked`, `--project-ref`, `--db-url` and `--local` still work in v3 but are deprecated, and v4 removes them. A hosted push asks for confirmation once, defaulting to No. Use `--yes` in non-interactive or agent runs. Source: `apps/cli/docs/supabase/db/push.md` at v3.1.0. (The supabase.com page https://supabase.com/docs/reference/cli/supabase-db-push still describes the old behaviour.) So `supabase link --project-ref <ref> && supabase db push` pushes to local: add `--remote`.
- **[V] Correct v3 sequence:**
  ```bash
  supabase login                          # or SUPABASE_ACCESS_TOKEN
  supabase link <project-ref>             # positional ref; --project-ref still accepted
  supabase db push --remote --dry-run     # review the plan
  supabase db push --remote               # migrations only
  supabase db push --remote --include-seed  # also runs [db.seed].sql_paths (see 1.3)
  supabase migration list                 # local vs remote history
  ```
  Source: `link.md` and `push.md` at v3.1.0. The workflow is also at https://supabase.com/docs/guides/deployment/database-migrations
- **[V] Our filenames `0001_extensions_helpers.sql` … `0026_….sql` are accepted, so no rename is needed.** The CLI matches migration files with `MIGRATE_FILE_PATTERN = /^([0-9]+)_(.*)\.sql$/u`, so the version recorded is `0001`…`0026`. Versions are compared numerically (`sortMigrationPathsByVersion`). Source: `apps/cli/src/command-internal/migration-history.ts` line 67 (develop and v3.1.0). Notes:
  - **[V]** Any later `supabase migration new` creates a 14-digit timestamp (`YYYYMMDDHHMMSS_name.sql`), which sorts after `0026`. Keep one scheme going forward: either hand-number `0027_…` or switch to timestamps, but don't interleave them. A local migration that sorts before the last remote version is reported as `missing-remote`, an out-of-order error.
  - **[V]** History is stored in `supabase_migrations.schema_migrations` (version, name, statements). Fix it with `supabase migration repair --status applied|reverted <version>`. Source: database-migrations guide.
  - **[V]** Each migration is applied as one batch. `CREATE INDEX CONCURRENTLY`, `VACUUM` and similar statements break atomicity. Our migrations contain none (checked with grep).
  - **[U]** Do not also run our own `@projectx/db` migrator against the same database. It keeps its own ledger, and the two would disagree.
- **[V] Seeds:** `supabase/config.toml` sets `[db.seed] sql_paths = ["./seed/*.sql"]`. `db push` seeds only with `--include-seed`, and records the hashes in `supabase_migrations.seed_files`. Only `supabase/seed/*` runs. `supabase/fixtures/*` (demo questions and **dev users with an ADMIN role**) is never read. Source: push SIDE_EFFECTS.md.
- **[V] Shim:** `supabase/shim/00_supabase_shim.sql` is outside `supabase/migrations/`, so the CLI never reads it. Never paste it into the SQL editor: it creates `anon`, `authenticated`, `service_role` and `auth.users`, which already exist on hosted Supabase.
- **[U]** `supabase/config.toml [auth]` is local-only (it includes `enable_anonymous_sign_ins = true`). Do not run `supabase config push` unless you mean to overwrite remote Auth settings.

### 1.3 Auth settings
- **[V]** Email confirmation is **ON by default on hosted projects**. Setting: Auth > Providers. Source: https://supabase.com/docs/guides/auth/passwords
- **[V]** The default SMTP is not for production. It only sends to org team members, is limited to **2 messages/hour**, and has no SLA. Configure custom SMTP before launch. Custom SMTP starts at 30 msgs/hour, adjustable in Auth > Rate Limits. Source: https://supabase.com/docs/guides/auth/auth-smtp
- **[V]** Redirect URLs: set **Site URL** to the production web origin, and add every `redirectTo` / `emailRedirectTo` target to the allow list. Wildcards: `*` doesn't cross `/` or `.`, `**` matches anything. Use exact paths in production. Our signup sends `emailRedirectTo: ${origin}/onboarding/`, so allow `https://<web-domain>/onboarding/` (plus the staging origin). Source: https://supabase.com/docs/guides/auth/redirect-urls
- **[V]** JWT verification:
  - **JWKS:** `GET https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`, cached about 10 min at the edge plus up to 10 min in clients.
  - **Issuer:** `iss` is `https://<ref>.supabase.co/auth/v1`, which matches our derived `jwtIssuer`.
  - **Legacy setup:** projects on the legacy JWT secret sign with HS256. Moving to signing keys means: Settings > JWT signing keys > *Migrate JWT secret* (this creates an asymmetric **standby** key), then *Rotate keys* to start signing with it.
  - **Mode choice:** `AUTH_MODE=jwks` only works once an asymmetric key is the active signing key. Until then use `AUTH_MODE=hs256` with `SUPABASE_JWT_SECRET`.

  Sources: https://supabase.com/docs/guides/auth/signing-keys, https://supabase.com/docs/guides/auth/jwts
- **[U]** Whether a **new** hosted project starts on asymmetric (ES256) keys by default is not stated in the docs I found. Check the project's JWT signing keys page, and `curl` the JWKS URL: a non-empty `keys` array is required for `jwks` mode.

### 1.4 Connection string
- **[V]** Connection matrix (https://supabase.com/docs/guides/database/connecting-to-postgres):

  | Mode | Host:port | Free | Paid | Paid + IPv4 add-on | Best for |
  |---|---|---|---|---|---|
  | Direct | `db.<ref>.supabase.co:5432` | IPv6 | IPv6 | IPv4 | Migrations, `pg_dump`, long-lived backend |
  | Supavisor session | `aws-<region>.pooler.supabase.com:5432` | IPv4 | IPv4 | IPv4 | Persistent backend on IPv4 |
  | Supavisor transaction | `aws-<region>.pooler.supabase.com:6543` | IPv4 | IPv4 | IPv4 | Serverless and edge |
  | Dedicated PgBouncer | `db.<ref>.supabase.co:6543` | none | IPv6 | IPv4 | High-performance paid tiers |

  The pooler user name is `postgres.<ref>`.
- **[V]** Transaction mode **does not support prepared statements**. Our `@projectx/db/postgres` already defaults to `prepare: false` (`packages/db/src/postgres.ts:37`), so `DATABASE_URL` = Supavisor transaction pooler (6543) works as documented.

- **[U]** Our `set local role` and `set_config` per-transaction RLS pattern through the Supavisor transaction pooler has not been run. Smoke-test `/users/me` and an RLS-only read on staging.

### 1.5 First admin
- **[V]** Our schema: `user_roles(user_id uuid → auth.users, role app_role ('ADMIN','REVIEWER'), granted_by, created_at)` with PK `(user_id, role)`. `authenticated` has SELECT only. Steps:
  1. The admin signs up through the web app and confirms their email.
  2. In the SQL editor (runs as `postgres`), run:
  ```sql
  insert into public.user_roles (user_id, role)
  select id, 'ADMIN' from auth.users where email = '<admin email>'
  on conflict do nothing;
  ```
  Verify with `GET /api/v1/users/me` → `roles: ["ADMIN"]`.
