"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { billingMe } from "@/lib/api/billing";
import { apiEnabled } from "@/lib/api/env";
import { track } from "@/lib/analytics";
import { useAuthStatus } from "@/lib/session/store";

const KEY = "tabby.upgradePrompt.lastShown";
const WEEK_MS = 7 * 86_400_000;
/**
 * Never inside a study session, the CBT, results-in-progress or any checkout surface. These prefixes are matched
 * against the current path; the (focus) and (exam) route groups do not render this component at all.
 */
const BLOCKED = ["/practice/", "/cbt/", "/tests/", "/pricing/", "/billing/", "/pay/", "/onboarding/", "/login/", "/signup/"];

export type UpgradeContext = "dashboard" | "results" | "progress";

const COPY: Record<UpgradeContext, string> = {
  dashboard: "Plus removes the monthly limit on full papers and CBT mocks. Practice stays free either way.",
  results: "Want to retry papers in the CBT as often as you like? Plus removes the monthly full-paper limit.",
  progress: "Full mocks are the best check of exam readiness. Plus makes them unlimited.",
};

function lastShown(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0);
  } catch {
    return Date.now(); // storage blocked: treat as recently shown (never nag)
  }
}

/**
 * Contextual, quiet upgrade card. Shown at most once a week per browser, only to signed-in FREE users while payments
 * are enabled. Dismissing it counts as shown.
 */
export function PremiumUpgradePrompt({ context }: { context: UpgradeContext }) {
  const path = usePathname() ?? "";
  const { status } = useAuthStatus();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!apiEnabled() || status !== "ready") return;
    if (BLOCKED.some((p) => path.startsWith(p))) return;
    if (Date.now() - lastShown() < WEEK_MS) return;
    let live = true;
    billingMe()
      .then((me) => {
        if (!live || me.tier !== "FREE" || !me.payments_enabled) return;
        setShow(true);
        try {
          localStorage.setItem(KEY, String(Date.now()));
        } catch {
          /* convenience only */
        }
        track("upgrade_prompt_shown", { context });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [status, path, context]);

  if (!show) return null;
  return (
    <aside aria-label="Tabby Plus" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-fg-soft">{COPY[context]}</p>
      <div className="flex shrink-0 gap-2">
        <ButtonLink href="/pricing/" size="sm" variant="secondary" onClick={() => track("upgrade_prompt_clicked", { context })}>
          See Plus
        </ButtonLink>
        <button type="button" className="h-9 px-3 text-sm text-fg-muted hover:text-fg" onClick={() => setShow(false)}>
          Not now
        </button>
      </div>
    </aside>
  );
}
