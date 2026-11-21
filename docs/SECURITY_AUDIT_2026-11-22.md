# Security audit — 2026-11-22

Scope: live production (tabbyprep.in, projectx-api on Cloud Run, Supabase project `gardheietftxyforposh`, GCS buckets),
plus API/web code on `main` @ 70702b2, with focus on everything added since the 2026-11-20 audit (docs/AUDIT_2026-11-20.md).
All database checks were read-only (session `default_transaction_read_only=on`). No production changes were made.

## Summary

No critical or high findings. One medium finding needs an owner action in the Supabase dashboard (signup email
confirmation). The rest are low/informational hardening items.

| # | Severity | Finding | Action owner |
|---|---|---|---|
| 1 | Medium | Email signups are auto-confirmed (`mailer_autoconfirm: true`) while Google sign-in is on | Owner (Supabase dashboard + SMTP) |
| 2 | Low | Expired Vercel OIDC token in public git history (c7e2759, 2026-11-15) | Owner (confirm Vercel project removed) |
| 3 | Low | 8 moderate transitive npm advisories, none reachable in our usage | Person 2 (dependency bumps) |
| 4 | Low | Web HSTS has no `includeSubDomains` (API has it) | Owner (check subdomains first) |
| 5 | Info | Script CSP is report-only (documented trade-off for PPR static shells) | — |
| 6 | Info | Rate limiter is in-memory per instance (max 3 instances, so effective limits are up to 3x) | — |
| 7 | Info | `/api/v1/openapi.json` is public (lists admin routes; they are all role-guarded) | — |
| 8 | Info | Unused Cloudflare/Vercel deploy config still in repo (wrangler.jsonc, open-next config, vercel.json, `deploy:web*` scripts, `@opennextjs/cloudflare`) | T5 / Person 2 |

## 1. Medium — auto-confirmed email signups

`GET /auth/v1/settings` reports `mailer_autoconfirm: true`, `disable_signup: false`, providers `email` + `google`.

Impact:
- Anyone can create an account for an address they do not own (impersonation, free-quota farming with throwaway
  addresses, no proof of ownership for billing receipts).
- Pre-account-takeover: an attacker registers `victim@gmail.com` with a password; because the email is marked
  confirmed, Supabase links the victim's later Google sign-in to that same user, and the attacker keeps password access.

Current exposure: 4 users in total; 2 have an email identity created before a linked Google identity. They are most
likely the team's own test accounts. Owners should confirm.

Fix (owner, Supabase dashboard): configure custom SMTP (Authentication → Emails → SMTP, e.g. Resend or Brevo free tier),
then turn on Authentication → Providers → Email → **Confirm email**. Do NOT turn it on without custom SMTP: Supabase's
built-in mailer only delivers to project team addresses, so every real signup would get stuck. The web already handles
the unconfirmed case (`emailSignUp` returns `needsEmailConfirmation`, AuthForms shows "Check your email").

## 2. Low — Vercel OIDC token in history

Commit c7e2759 (Owner B, 2026-11-15) added `.env.local` with `VERCEL_OIDC_TOKEN`, plus `.vercel/project.json`. The repo is
public. Vercel OIDC tokens are short-lived (hours), so it is expired, and the web no longer runs on Vercel. Action: make
sure the Vercel project is deleted or disconnected. History rewriting is not worth the disruption.

## 3. Low — npm advisories (production deps)

`npm audit --omit=dev`: 0 critical, 0 high, 8 moderate:
- `uuid <11.1.1` (missing buffer bounds check when a `buf` argument is passed) via `@google-cloud/storage` → teeny-request /
  retry-request / gaxios. We never pass `buf`. Fix: `@google-cloud/storage@9` (major bump, API code).
- `glob` / `minimatch` via `@opennextjs/cloudflare`, a build-time adapter we no longer deploy with. Fix: remove the dependency (item 8).

## Verified OK (no action)

- **RLS**: enabled on all 49 public tables. `anon` can only SELECT taxonomy (exams/subjects/chapters/topics).
  `authenticated` writes are column-scoped: bookmarks, goals, exam preferences, and harmless profile fields (display name,
  class, target exam/year, timezone, daily goal, onboarding timestamp). No role, plan, XP or entitlement column is writable.
  No `public` function is executable by anon/authenticated (no RPC surface).
- **API auth**: JWKS verification with audience + issuer (HS256 pinned in hs256 mode); `AUTH_MODE=test` refused outside
  dev/test. Roles come from `user_roles` in the DB, never from JWT claims. `/admin/*` returns 401 unauthenticated.
- **New code since 2026-11-20**: `/public/papers`, `/practice/sessions/{id}/analysis` (user-scoped + Plus check), the practice
  `id` filter for shared links (published + FREE + active chapter only, answer-free DTO), the public slug/redirect/related
  queries (FREE + active chapter), rewarded-ad nonces (single use, 15-min TTL, per-user advisory lock, daily/monthly caps).
- **CORS**: foreign origins get no `Access-Control-Allow-Origin`.
- **Headers**: web has HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, enforced
  frame-ancestors/base-uri/object-src/form-action CSP; API has HSTS (includeSubDomains) + nosniff. 1 MiB JSON body cap.
- **Web routes**: `/api/revalidate` uses a constant-time compare and a >= 32-char secret; `/api/dev/token` returns 404 in production.
- **XSS**: the only `dangerouslySetInnerHTML` sinks are KaTeX output (`trust` left at default false, so `\href`/`\url`
  with `javascript:` and the `\html*` macros are disabled; katex 0.19.1), JSON-LD (escapes `<`), and a static theme script.
- **Secrets**: no secrets in tracked files. Cloud Run takes all secrets (DB URL, signing, IP hash, revalidate, Razorpay)
  from Secret Manager; no plaintext secret env vars. Dedicated service accounts; maxScale 3.
- **Storage**: only `public-assets` is public, as object read (`legacyObjectReader`); anonymous listing returns 401 on all
  buckets. `source-docs` and `user-uploads` are private.
- **Versions**: next 16.4.6, react 19.3.0, hono 4.13.18, jose 6.2.14, katex 0.19.1; no advisories.

## Ops note

gcloud on the operator machine failed to start because `CLOUDSDK_PYTHON` pointed at a missing interpreter. Workaround:
`CLOUDSDK_PYTHON="<Cloud SDK>/platform/bundledpython/python.exe"`.
