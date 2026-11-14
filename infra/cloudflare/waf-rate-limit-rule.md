# WAF rate-limit backstop (manual, REQUIRES APPROVAL)

Nothing in this repo applies this rule. It is a documented, copy-paste configuration for the Cloudflare dashboard
(Security > WAF > Rate limiting rules). The free plan includes one rate-limit rule, so it is used as a coarse backstop
behind the per-route Workers Rate Limiting bindings (`RL_*`, see `apps/api/wrangler.toml`).

## Rule 1 (the single free rule)

| Field | Value |
|---|---|
| Name | `projectx-api-backstop` |
| Expression | `(http.host eq "api.<domain>" and starts_with(http.request.uri.path, "/api/v1/"))` |
| Characteristics | IP (free plan only offers IP) |
| Requests / period | Use the period the plan allows (typically 10 s). Suggested start: 100 requests / 10 s (verify current free-plan limits in the dashboard) |
| Action | Block, duration 10 seconds (the longest the free plan allows) |
| Response | 429 with default body |

Rationale: legitimate clients stay far below this (Owner A SSR calls are cached at the edge; browsers do a handful of
requests per page). The per-route bindings handle fine-grained limits (search 30/min, doubts 5/min, ...).

## Verifying

1. Staging only first. `for i in $(seq 1 150); do curl -s -o /dev/null -w "%{http_code}\n" https://api-staging.<domain>/api/v1/health; done`
   should start returning 429 after the threshold.
2. Check Security > Events for the rule firing; confirm Owner A's SSR egress IPs are not blocked (add a skip rule or
   raise the threshold if SSR is on Workers/Pages sharing IP space).
3. Record the date and threshold in the usage log (`usage-runbook.md`).
