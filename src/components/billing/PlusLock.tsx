"use client";

import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Primitives";

const fmt = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long" });

/**
 * Lock screen for the free full-paper allowance (API error QUOTA_EXCEEDED). Calm, factual, and it always points back to
 * what stays free. Never shown inside a running session; only before one starts.
 */
export function PlusLock({ used, limit, resetsOn }: { used: number; limit: number; resetsOn: string }) {
  return (
    <Card className="p-6" role="region" aria-label="Full paper limit reached">
      <h2 className="font-display text-xl font-semibold">You&apos;ve used your {limit} free full papers this month</h2>
      <p className="mt-2 text-fg-muted">
        {used} of {limit} used. They reset on {fmt(resetsOn)}. Chapter practice, tests and solutions stay unlimited, and your past papers and results stay available.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <ButtonLink href="/pricing/">Get unlimited papers</ButtonLink>
        <ButtonLink href="/practice/" variant="secondary">
          Keep practising
        </ButtonLink>
      </div>
    </Card>
  );
}

