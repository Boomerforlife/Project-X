"use client";

import { ButtonLink } from "@/components/ui/Button";
import { COPY } from "@/lib/copy";
import { routes } from "@/lib/routes";
import { pricingHref, useCurrentUrl } from "./pricingNext";
import { Card } from "@/components/ui/Primitives";

const fmt = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long" });

/**
 * Lock screen for the free paper allowance (API error QUOTA_EXCEEDED). Calm, factual, and it always points back to
 * what stays free. Never shown inside a running session; only before one starts. The only thing the free tier limits
 * here is full papers (apps/api billing quota); chapter practice, answers and solutions have no cap.
 */
export function PlusLock({ used, limit, resetsOn }: { used: number; limit: number; resetsOn: string }) {
  const here = useCurrentUrl();
  return (
    <Card className="p-6" role="region" aria-label="Full paper limit reached">
      <h2 className="font-display text-xl font-semibold">You&apos;ve used your {limit} free {COPY.papers} this month</h2>
      <p className="mt-2 text-fg-muted">
        {used} of {limit} used. They reset on {fmt(resetsOn)}. Only full {COPY.papers} are limited: chapter practice, answers and solutions stay free with no cap, and your past {COPY.papers} and results stay available.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <ButtonLink href={pricingHref(here)}>Get unlimited {COPY.papers}</ButtonLink>
        <ButtonLink href={routes.allQuestions} variant="secondary">
          Keep practising
        </ButtonLink>
      </div>
    </Card>
  );
}

