# Cloud setup checklist (for the project owner)

Plain-language, in order. Do **staging first**, check it works, then repeat for production. The developer (or Claude) can run
the commands for you once you approve; the technical details are in `docs/DEPLOYMENT.md`. Nothing here has been tried on a
real account yet, so expect small surprises and tell the developer exactly what you see.

Placeholders: `<domain>` is your website address (for example `example.in`), `<ref>` is your Supabase project id.
Never paste secrets in chat, email or git. Put them only where this list says.

## Before you start: what you need
* A credit/debit card (Cloudflare Workers Paid is required, see "Costs").
* A domain name you own, added to Cloudflare (Cloudflare dashboard -> Add a domain, follow the nameserver steps).
* A Supabase account, a Cloudflare account, and an email-sending service account for sign-up emails (for example any
  provider that gives you SMTP details: host, port, username, password).
* The email address of the person who will be the first admin.

## Part A. Supabase (database and login)

1. **Create the staging project.** supabase.com -> New project. Name it `projectx-staging`, pick the region closest to students
   (India: Mumbai / `ap-south-1`), set a strong **database password** and save it in your password manager.
   *Check:* the project dashboard opens. *Copy the project id (`<ref>`) from the address bar:* `supabase.com/dashboard/project/<ref>`.
2. **Copy the keys.** Project Settings -> API Keys. Copy the **Project URL** (`https://<ref>.supabase.co`) and the **publishable key**
   (starts with `sb_publishable_`). These two are safe to share with the developer. The **secret key** (`sb_secret_`) is private:
   do not send it to anyone, you will not need it.
3. **Create the database tables (migrations).** Ask the developer to run, with your OK:
   `supabase link <ref>` then `supabase db push --remote --yes`. (Version 3 of the Supabase tool needs the word `--remote`, otherwise
   it changes a local copy and nothing happens online.) They need your database password for this.
   *Check:* Supabase -> Table Editor shows tables such as `user_roles`; the developer's `supabase migration list` shows 0001 to 0015 on both sides.
4. **Turn on sign-up emails properly.** Authentication -> SMTP Settings: enter your email provider's details and a sender address.
   Without this, Supabase only emails your own team and only about 2 emails per hour, so real students cannot sign up.
   *Check:* sign up with a throwaway address later (step 22) and the email arrives.
5. **Set the website addresses.** Authentication -> URL Configuration. *Site URL:* `https://staging.<domain>`. *Redirect URLs:* add
   `https://staging.<domain>/onboarding/` and, for developer testing, `http://localhost:3000/**`.
   *Check:* both are listed and saved.
6. **Login keys.** Settings -> JWT signing keys. If you see a "Migrate JWT secret" button, click it, then "Rotate keys". Then ask
   the developer to open `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`: it must show something with `keys`. If not, the developer will
   use the older "hs256" mode and needs the **JWT secret** from the same page (this one IS a secret: send it only through a password manager or
   type it directly into the Cloudflare secret prompt in step 15).
7. **Keep email confirmation ON** (Authentication -> Providers -> Email). It is on by default.

## Part B. Cloudflare account

8. **Upgrade to Workers Paid** ($5/month). Cloudflare dashboard -> Workers & Pages -> Plans. *Why:* the free plan allows only 10 milliseconds
   of computing per page view, which a Next.js site will usually exceed.
   *Check:* the plan page says "Workers Paid".
9. **Find two ids.** Your **Account ID** (Workers & Pages overview, right side) and your domain's **Zone ID** (domain overview, right side). Send both to the developer (they are not secret).
10. **Make a deploy token.** My Profile -> API Tokens -> Create Token -> template "Edit Cloudflare Workers", add permissions for R2 storage (edit) and D1 (edit),
    zone = your domain. Name it `projectx-deploy`. Copy it **once** (it is shown only once) into your password manager. The developer will ask you to
    paste it into their terminal; do not email it. *The exact permission names may differ slightly; if unsure, ask the developer to watch your screen.*
11. **Make a cache-purge token (separate).** Create Token -> Custom -> Zone / Cache Purge / Purge, only for your domain. Name it `projectx-purge`.
    It is only used by the API server and cannot do anything else.
12. **Create storage (developer runs, with your OK).** They create 3 R2 buckets for the API (`projectx-source-docs-staging`,
    `projectx-public-assets-staging`, `projectx-user-uploads-staging`), 1 R2 bucket for the website cache (`projectx-web-cache-staging`) and 1 D1 database
    (`projectx-web-tags-staging`). *Check:* Cloudflare -> R2 and -> D1 list them. Keep the public `r2.dev` link **disabled**.
13. **Public image address.** In R2 -> `projectx-public-assets-staging` -> Settings -> Custom domains, add `assets-staging.<domain>` (or let the developer do it).
    *Check:* an uploaded test image opens in the browser through that address.

## Part C. Deploy the staging API and website

14. **Pick the staging addresses** and tell the developer: web `staging.<domain>`, API `api-staging.<domain>`. These are added as Cloudflare *Custom Domains*
    (not plain routes). If you already created DNS records with these exact names, delete them first: Cloudflare refuses to overwrite them.
15. **Create the secrets (developer runs; you type/paste the values when prompted).** For the API: database address (`DATABASE_URL`, see below), two random
    strings (`SIGNING_SECRET`, `IP_HASH_SECRET`, the developer generates them), the purge token from step 11, and (hs256 only) the JWT secret. For both API and
    website: **one shared random password of 32+ characters** (stored as `WEB_REVALIDATE_SECRET` on the API and `REVALIDATE_SECRET` on the website). It must be
    **identical** in both places.
    *Database address:* Supabase -> Connect -> "Transaction pooler" connection string (port 6543); replace `[YOUR-PASSWORD]` with your database password.
16. **Allow the website to call the API.** The developer sets the API setting `CORS_ALLOWED_ORIGINS` to exactly `https://staging.<domain>` (no wildcard, no
    trailing slash) and `WEB_REVALIDATE_URL` to `https://staging.<domain>/api/revalidate/`. If this is wrong, the site loads but shows no data and the browser
    console says "CORS".
17. **Deploy the API first**, then the website (the website build fetches data from the API). Commands for the developer: `cd apps/api && npx wrangler deploy --env staging`,
    then from the repo root `npm run deploy:web:staging` (with the build values from DEPLOYMENT.md 5.3 set).
    *Check:* `https://api-staging.<domain>/api/v1/health` says ok, and `https://staging.<domain>/` opens.
18. **First admin.** The admin signs up on the staging site and clicks the email link. Then in Supabase -> SQL Editor run (replace the email):
    `insert into public.user_roles (user_id, role) select id, 'ADMIN' from auth.users where email = 'admin@example.com' on conflict do nothing;`
    *Check:* the admin sees admin pages; the developer's `/api/v1/users/me` shows `ADMIN`.

## Part D. Verify staging (do all of these)
19. Home page loads and does **not** show a "Demo mock data" badge.
20. A question page loads; refresh twice, the second is faster.
21. Publish then unpublish a question in admin; the public page changes within a few seconds (if it takes hours, tell the developer: this is the cache-refresh feature we have not been able to test yet).
22. Sign up with a new email; the confirmation email arrives and the link opens `/onboarding/`.
23. Try logging in from a phone and a normal computer browser.
24. Open the browser console (F12) on the home page; send the developer a screenshot of any red messages. Messages starting "Content-Security-Policy-Report-Only" about scripts are expected for now.

## Part E. Production
25. Repeat Parts A, B (steps 9-13, new bucket names without `-staging`), C and D with: a **separate Supabase project** (`projectx-prod`), web `<domain>`,
    API `api.<domain>`, assets `assets.<domain>`, secrets that are **different** from staging, and the Site URL / redirect URLs of the production site.
26. Production extras: set `NEXT_PUBLIC_ALLOW_INDEXING=true` only when you want Google to index the site; never load the demo data (`supabase/fixtures`); use only content you have
    the legal right to publish (no copied past-paper questions until licensing is cleared).

## What to send back to the developer
* Supabase: project id, Project URL, publishable key (not the secret key).
* Cloudflare: Account ID, Zone ID, the domain names you chose.
* Confirmation that Workers Paid is active, custom SMTP is saved, and the first admin's email.
* Do NOT send: database password, JWT secret, deploy token, purge token, secret key. Type those into the terminal prompt the developer opens, or share through a password manager.

## Costs and free-tier notes (check current prices before paying)
* Cloudflare Workers Paid: about $5/month, covers both Workers (website + API). Free plan is not enough (10 ms CPU, 100,000 requests/day).
* R2 and D1 have free allowances; at launch scale they are expected to be small. Cloudflare bills Workers Cache requests as normal Worker requests.
* Supabase free projects pause when idle and have limited resources; the paid plan is likely needed before real traffic. Custom SMTP is billed by your email provider.
* Hyperdrive (optional, later): free plan allows 100,000 queries/day.
* A staging environment doubles the (small) cost; you can delete staging resources when not testing.

## Things that will bite you
* **Supabase CLI v3 needs `--remote`.** Without it the push goes to a local database and "succeeds".
* **Default Supabase email sending is for testing only** (2/hour, team members only). Set SMTP before inviting anyone.
* **Redirect URL mismatch:** if the confirmation link says "redirect not allowed", the exact page (`/onboarding/`, with the trailing slash) is missing from the allow list.
* **`NEXT_PUBLIC_*` settings are baked in at build time.** Changing them in Cloudflare later does nothing; rebuild and redeploy. Never reuse the staging build for production.
* **CORS:** the API only accepts the exact website address. A typo, `http` vs `https`, or an extra `/` breaks every call.
* **Secrets must match:** `WEB_REVALIDATE_SECRET` (API) and `REVALIDATE_SECRET` (website) must be the same string, or published changes will not appear until the cache expires (up to an hour or a day).
* **Custom Domain, not Route:** the API and the website must be attached as Custom Domains, otherwise the API cannot reach the website to refresh pages. A leftover DNS record on the same name blocks this.
* **Database address:** use the pooler (port 6543) for the API. The direct address is IPv6-only unless you buy the IPv4 add-on. For Hyperdrive use the *direct* address and create it with caching disabled.
* **Deploys start with an empty cache**, so the first visits after a deploy are slower.
* **Rate-limit ids are shared across the whole Cloudflare account.** Do not reuse 1001-1006, 2001-2006, 3001-3006 for other projects.
* **Cache purging is slow by design:** only 5 purge requests per minute are allowed; a burst of edits may take a while to show.
* **Do not paste the Supabase "shim" file** into the SQL editor, and never load the demo/fixture data into production (it contains admin test users).
* **Keep the secret key and database password out of git and chat.** If one leaks, rotate it in Supabase/Cloudflare immediately.
* The "Demo mock data" badge on the live site means the website was built without `NEXT_PUBLIC_DATA_SOURCE=api`.
* Wrangler/Cloudflare permission names and a few cache behaviours (listed in `docs/STATUS.md`, "Unverified") are untested: report anything odd rather than working around it.
