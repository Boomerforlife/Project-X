"use client";
/**
 * Admin overview (/admin/): students, practice, content, revenue, support, pipeline and system health on one page.
 * Data: GET /admin/metrics (aggregates only, ADMIN role enforced by the API) plus the public /health check.
 * Read-only: nothing on this page changes data. Editing tools live on their own pages (/admin/questions/).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AdminMetrics } from "@projectx/contracts";
import { Button } from "@/components/ui/Button";
import { Card, Stat } from "@/components/ui/Primitives";
import { ago, alertsFor, bucket, bytes, fmt, inr, pct, sumBuckets } from "@/lib/admin/overview";
import { adminMetrics, apiHealth, type ApiHealth } from "@/lib/api/admin";
import { apiEnabled } from "@/lib/api/env";
import { isApiError } from "@/lib/api/errors";
import { me } from "@/lib/api/student";
import { cn } from "@/lib/cn";
import { useAuthStatus } from "@/lib/session/store";

type Access = "checking" | "ok" | "denied" | "signedOut" | "mock";

function useAdminAccess(): Access {
  const { status } = useAuthStatus();
  const [role, setRole] = useState<"ok" | "denied" | null>(null);
  const ready = apiEnabled() && status === "ready";
  useEffect(() => {
    if (!ready) return;
    let live = true;
    me()
      .then((u) => live && setRole(u.roles.includes("ADMIN") ? "ok" : "denied"))
      .catch(() => live && setRole("denied"));
    return () => {
      live = false;
    };
  }, [ready]);
  if (!apiEnabled()) return "mock";
  if (status === "loading") return "checking";
  if (status !== "ready") return "signedOut";
  return role ?? "checking";
}

export function AdminOverview() {
  const access = useAdminAccess();
  if (access === "checking") return <p className="py-16 text-center text-fg-muted">Checking access…</p>;
  if (access === "mock") return <Notice title="Needs the live API">The admin overview reads the real database, so it is not available on mock data.</Notice>;
  if (access === "signedOut")
    return (
      <Notice title="Sign in to continue">
        <Link className="underline" href="/login/?next=%2Fadmin%2F">
          Log in
        </Link>{" "}
        with an admin account.
      </Notice>
    );
  if (access === "denied") return <Notice title="No access">This page is for admins. The server enforces this too.</Notice>;
  return <Overview />;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mx-auto mt-16 max-w-lg p-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-fg-muted">{children}</p>
    </Card>
  );
}

function Overview() {
  const [m, setM] = useState<AdminMetrics | null>(null);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    void Promise.allSettled([adminMetrics(), apiHealth()]).then(([metrics, h]) => {
      if (!live) return;
      if (metrics.status === "fulfilled") {
        setM(metrics.value);
        setError(null);
      } else setError(isApiError(metrics.reason) ? metrics.reason.message : "Could not load the metrics.");
      if (h.status === "fulfilled") setHealth(h.value);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [tick]);
  const refresh = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {m ? <>Updated {ago(m.generated_at)} · last {m.window_days} days unless noted · aggregates only, no student identities</> : "Loading the system overview…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/questions/" className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2">
            Question classification
          </Link>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={loading} aria-busy={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </header>

      {error && (
        <Card className="mt-6 p-4 text-sm" role="alert">
          {error}
        </Card>
      )}
      {!m && !error && <p className="py-16 text-center text-fg-muted">Loading…</p>}
      {m && <Body m={m} health={health} />}
    </div>
  );
}

function Body({ m, health }: { m: AdminMetrics; health: ApiHealth | null }) {
  const alerts = alertsFor(m, health ? health.ok : null);
  const examTotals = m.content.by_exam_subject;
  return (
    <div className="mt-6 space-y-6">
      <Section title="Needs attention">
        {alerts.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing needs attention.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {alerts.map((a) => (
              <li key={a.text} className="flex gap-2">
                <span className={cn("mt-0.5 shrink-0 rounded px-1.5 text-[0.65rem] font-semibold uppercase", a.level === "warn" ? "bg-fg text-bg" : "bg-surface-3 text-fg-muted")}>
                  {a.level === "warn" ? "Check" : "Note"}
                </span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="System">
        <Grid>
          <Stat label="API" value={health ? (health.ok ? "OK" : "Down") : "…"} sub={health ? `${health.status}${health.db ? ` · db ${health.db}` : ""} · ${health.ms} ms` : "checking"} />
          <Stat label="API version" value={health?.version ?? "—"} />
          <Stat label="Database size" value={bytes(m.database.size_bytes)} />
          <Stat label="Last migration" value={m.database.last_migration ?? "—"} />
        </Grid>
        <p className="mt-4 text-xs text-fg-muted">
          Consoles:{" "}
          {CONSOLES.map((c, i) => (
            <span key={c.href}>
              {i > 0 && " · "}
              <a className="underline" href={c.href} target="_blank" rel="noreferrer">
                {c.label}
              </a>
            </span>
          ))}
        </p>
      </Section>

      <Section title="Students">
        <Grid>
          <Stat label="Accounts" value={fmt(m.users.total)} sub={`+${fmt(m.users.new_7d)} this week · +${fmt(m.users.new_30d)} in 30 days`} />
          <Stat label="Active today" value={fmt(m.users.active_1d)} sub="answered a question" />
          <Stat label="Active, 7 days" value={fmt(m.users.active_7d)} />
          <Stat label="Active, 30 days" value={fmt(m.users.active_30d)} />
          <Stat label="Finished onboarding" value={fmt(m.users.onboarded)} />
          <Stat label="Sign-in methods" value={`${fmt(m.users.with_google)} / ${fmt(m.users.with_password)}`} sub="Google / email + password" />
          <Stat label="Email not confirmed" value={fmt(m.users.email_unconfirmed)} />
          <Stat label="Admins" value={fmt(m.users.admins)} />
        </Grid>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <Daily title="Sign-ups per day" rows={m.daily.signups} />
          <Daily title="Answers per day" rows={m.daily.attempts} />
          <Daily title="Active students per day" rows={m.daily.active_users} />
        </div>
      </Section>

      <Section title="Practice">
        <Grid>
          <Stat label="Answers" value={fmt(m.activity.attempts_total)} sub={`${fmt(m.activity.attempts_7d)} this week · ${fmt(m.activity.attempts_30d)} in 30 days`} />
          <Stat label="Accuracy, 30 days" value={pct(m.activity.correct_rate_30d)} />
          <Stat label="Sessions" value={fmt(m.activity.sessions_total)} sub={`${fmt(m.activity.sessions_7d)} started this week`} />
          <Stat label="Sessions finished, 30 days" value={fmt(m.activity.sessions_completed_30d)} />
          <Stat label="Full papers" value={fmt(m.activity.paper_sessions_total)} sub={`${fmt(m.activity.paper_sessions_completed)} submitted`} />
          <Stat label="Bookmarks" value={fmt(m.activity.bookmarks)} />
          <Stat label="Open mistakes" value={fmt(m.activity.mistakes_open)} />
          <Stat label="Study plans" value={fmt(m.activity.study_plans)} />
        </Grid>
        {m.activity.sessions_by_mode_30d.length > 0 && <Buckets title="Sessions by mode, 30 days" rows={m.activity.sessions_by_mode_30d} />}
      </Section>

      <Section title="Content">
        <Grid>
          <Stat label="Published" value={fmt(m.content.published)} sub={`${fmt(m.content.paper_only_published)} paper-only (no chapter yet)`} />
          <Stat label="Drafts" value={fmt(m.content.drafts)} />
          <Stat label="In the sitemap" value={fmt(m.content.in_sitemap)} />
          <Stat label="Full papers" value={fmt(m.content.papers)} />
          <Stat label="Published, image only" value={fmt(m.content.published_without_text)} sub="no readable text" />
          <Stat label="Archived" value={fmt(m.content.archived)} />
        </Grid>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <caption className="sr-only">Questions by exam and subject</caption>
            <thead className="text-xs text-fg-muted">
              <tr>
                <th className="py-2 pr-4 font-medium">Exam</th>
                <th className="py-2 pr-4 font-medium">Subject</th>
                <th className="py-2 pr-4 text-right font-medium">Published</th>
                <th className="py-2 text-right font-medium">Draft</th>
              </tr>
            </thead>
            <tbody>
              {examTotals.map((r) => (
                <tr key={`${r.exam}-${r.subject}`} className="border-t border-line">
                  <td className="py-2 pr-4">{r.exam}</td>
                  <td className="py-2 pr-4">{r.subject}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{fmt(r.published)}</td>
                  <td className="py-2 text-right tabular-nums">{fmt(r.draft)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <Buckets title="Verification (all questions)" rows={m.content.by_verification} label={VERIFICATION_LABEL} />
          <Buckets title="Difficulty (published)" rows={m.content.by_difficulty_published} />
          <Buckets title="Who set the difficulty (published)" rows={m.pipeline.difficulty_by_source} label={DIFFICULTY_SOURCE_LABEL} />
        </div>
      </Section>

      <Section title="Revenue">
        <Grid>
          <Stat label="Revenue, all time" value={inr(m.billing.revenue_paise_total)} sub={`${inr(m.billing.refunded_paise_total)} refunded`} />
          <Stat label="Revenue, 30 days" value={inr(m.billing.revenue_paise_30d)} />
          <Stat label="Plus right now" value={fmt(m.billing.plus_active)} sub="students with an active pass" />
          <Stat label="Paid orders" value={fmt(bucket(m.billing.orders_by_status, "PAID"))} sub={`${fmt(sumBuckets(m.billing.orders_by_status))} orders in total`} />
          <Stat label="Last payment" value={ago(m.billing.last_paid_at)} />
          <Stat label="Last Razorpay webhook" value={ago(m.billing.last_webhook_at)} sub={`${fmt(m.billing.webhooks_unprocessed)} unprocessed`} />
        </Grid>
        {m.billing.orders_by_status.length > 0 && <Buckets title="Orders by status" rows={m.billing.orders_by_status} />}
      </Section>

      <Section title="Support">
        <Grid>
          <Stat label="Open question reports" value={fmt(m.support.reports_open)} />
          <Stat label="Open doubts" value={fmt(m.support.doubts_open)} />
        </Grid>
        <h3 className="mt-6 text-sm font-medium">Latest reports</h3>
        {m.support.recent_reports.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">No reports yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {m.support.recent_reports.map((r) => (
              <li key={`${r.created_at}-${r.question_slug}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                <span className="text-xs text-fg-muted">{ago(r.created_at)}</span>
                <span className="rounded bg-surface-3 px-1.5 text-xs">{r.reason}</span>
                {r.question_slug ? (
                  <Link className="underline" href={`/jee/questions/${r.question_slug}/`}>
                    {r.question_slug}
                  </Link>
                ) : (
                  <span className="text-fg-muted">question removed</span>
                )}
                {r.excerpt && <span className="basis-full text-fg-muted">{r.excerpt}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Pipeline and AI">
        <Grid>
          <Stat label="Ingestion jobs" value={fmt(sumBuckets(m.pipeline.jobs_by_status))} sub={`last ${ago(m.pipeline.last_job_at)}`} />
          <Stat label="AI runs, 30 days" value={fmt(m.pipeline.ai_runs_30d)} sub={`$${m.pipeline.ai_cost_usd_30d.toFixed(2)} recorded cost`} />
        </Grid>
        {m.pipeline.jobs_by_status.length > 0 && <Buckets title="Jobs by status" rows={m.pipeline.jobs_by_status} />}
      </Section>

      <Section title="Site events, 30 days">
        {m.analytics_30d.length === 0 ? (
          <p className="text-sm text-fg-muted">No events recorded.</p>
        ) : (
          <Buckets title="Counted events (cookieless daily counters)" rows={m.analytics_30d.map((e) => ({ key: e.event, count: e.count }))} />
        )}
      </Section>
    </div>
  );
}

const CONSOLES = [
  { label: "Cloud Run", href: "https://console.cloud.google.com/run?project=projectx-staging-a7k2" },
  { label: "Logs", href: "https://console.cloud.google.com/logs/query?project=projectx-staging-a7k2" },
  { label: "Supabase", href: "https://supabase.com/dashboard/project/gardheietftxyforposh" },
  { label: "Razorpay", href: "https://dashboard.razorpay.com/" },
  { label: "Search Console", href: "https://search.google.com/search-console?resource_id=sc-domain%3Atabbyprep.in" },
  { label: "AdSense", href: "https://adsense.google.com/" },
];

const VERIFICATION_LABEL: Record<string, string> = {
  OFFICIAL_KEY_MATCHED: "Official key matched",
  HUMAN_VERIFIED: "Human reviewed",
  AUTOMATED_CHECKS_PASSED: "AI checked",
  PENDING: "Pending",
  HUMAN_REVIEW_REQUIRED: "Needs human review",
  DISPUTED: "Disputed",
};
const DIFFICULTY_SOURCE_LABEL: Record<string, string> = { AI: "AI estimate", ADMIN: "Reviewer", IMPORT: "Import", STATS: "Student results", NONE: "Not recorded" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card as="section" className="p-5 sm:p-6" aria-label={title}>
      <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

function Buckets({ title, rows, label }: { title: string; rows: { key: string; count: number }[]; label?: Record<string, string> }) {
  const total = Math.max(1, sumBuckets(rows));
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex justify-between gap-3">
              <span className="truncate">{label?.[r.key] ?? r.key}</span>
              <span className="tabular-nums text-fg-muted">{fmt(r.count)}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="h-full rounded-full bg-fg" style={{ width: `${(r.count / total) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 30 daily bars; the exact numbers are in a visually hidden list for screen readers. */
function Daily({ title, rows }: { title: string; rows: { day: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <figure>
      <figcaption className="flex justify-between text-sm">
        <span className="font-medium">{title}</span>
        <span className="tabular-nums text-fg-muted">{fmt(total)} total</span>
      </figcaption>
      <div className="mt-2 flex h-16 items-end gap-[2px]" aria-hidden>
        {rows.map((r) => (
          <div key={r.day} title={`${r.day}: ${r.count}`} className={cn("flex-1 rounded-t-sm", r.count ? "bg-fg" : "bg-surface-3")} style={{ height: `${r.count ? Math.max(6, (r.count / max) * 100) : 4}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[0.65rem] text-fg-subtle" aria-hidden>
        <span>{rows[0]?.day.slice(5)}</span>
        <span>{rows.at(-1)?.day.slice(5)}</span>
      </div>
      <ul className="sr-only">
        {rows.map((r) => (
          <li key={r.day}>
            {r.day}: {r.count}
          </li>
        ))}
      </ul>
    </figure>
  );
}
