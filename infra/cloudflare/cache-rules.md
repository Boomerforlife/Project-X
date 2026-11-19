# Cache rules and purge notes (manual, REQUIRES APPROVAL)

The API sets explicit `Cache-Control` per class (`packages/edge/src/cache.ts`, table in API_CONTRACTS section 1) and a
`Cache-Tag` on public responses. No Cloudflare rule is strictly required when Workers Caching is enabled
(`[cache] enabled = true` in `apps/api/wrangler.toml`). The rules below are for the fallback / belt-and-braces setup.

## Mode A: Workers Caching (preferred, `CACHE_MODE=workers`, `CACHE_PURGE_DRIVER=workers`)
* Verify availability on the account/plan first (legacy note: the web now runs on Cloud Run behind Firebase Hosting, see docs/DEPLOYMENT_GCP.md). If unavailable use Mode B.
* Purge: `createWorkersCacheInvalidator(cache)` wraps the runtime's `cache.purge({ tags })`; the exact runtime handle must be
  confirmed against current Workers docs when W2's `worker.ts` wires it up (verify before enabling).

## Mode B: Cache API fallback (`CACHE_MODE=cache_api`)
* API mounts `edgeCacheMiddleware()`; caches only GET without `Authorization` and only `public` + `s-maxage` responses.
* The Cache API cannot purge by tag. Purge via the zone API instead: `CACHE_PURGE_DRIVER=zone_api` (needs a
  token scoped to Cache Purge only, `CF_ZONE_ID`, `CF_API_TOKEN_PURGE`). Tag purge on a zone may require a plan that supports
  `Cache-Tag` purging; if not, fall back to purge-by-URL or accept `s-maxage` expiry (5 min lists / 1 h content / 24 h taxonomy).

## Zone Cache Rule (optional, for `api.<domain>`)
| Field | Value |
|---|---|
| Expression | `(http.host eq "api.<domain>" and http.request.method eq "GET" and not any(http.request.headers.names[*] eq "authorization"))` |
| Cache eligibility | Eligible for cache |
| Edge TTL | Respect origin (use `Cache-Control` from the API) |
| Browser TTL | Respect origin |

Do NOT add rules that cache requests carrying `Authorization`, `/api/v1/users/*`, `/api/v1/admin/*`, `/api/v1/practice/sessions*`,
`/api/v1/attempts`, `/api/v1/doubts`, `/api/v1/uploads` or `/api/v1/health`. Those responses are `private, no-store` / `no-store`.

## Assets (`assets.<domain>` -> R2 `projectx-public-assets`)
* Objects are content-addressed (`assets/{sha[0..2]}/{sha}.{ext}`) and written with
  `Cache-Control: public, max-age=31536000, immutable`; never purge them, publish a new hash instead.
* Attach the custom domain to the bucket in the dashboard (REQUIRES APPROVAL). Apply `r2-cors.json` to the bucket.

## Manual purge
`CF_ZONE_ID=... CF_API_TOKEN_PURGE=... npm run cache:purge -w @projectx/edge -- --tags tax` (calls the live API; REQUIRES APPROVAL).
Taxonomy changes via migration/seed need `tax` purged. Never purge everything automatically.
