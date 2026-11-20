import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { PlanCompare } from "@/components/billing/PlanCompare";
import { PricingPlans } from "@/components/billing/PricingPlans";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { ADS_CONFIG, adsenseReady } from "@/lib/ads/config";
import { plans } from "@/lib/api/billing";
import { freeTierEntitlements } from "@/lib/api/monetization";
import { compareGroups, plusHighlights } from "@/lib/billing/compare";
import { FULL_PAPERS } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: `Pricing: Free and ${SITE.name} Plus`,
  description: `Practice and step-by-step solutions are free. ${SITE.name} Plus adds longer study plans, the full diagnostic report and more problem versions. One-time passes, no auto-renewal.`,
  path: "/pricing/",
});

/**
 * Prices and free-tier limits are read from the API (server is the source of truth); cached briefly so a change shows
 * within minutes. Both calls are anonymous, so the cached copy holds nothing personal.
 */
async function loadPricing() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("web", "billing:plans");
  const [data, free] = await Promise.all([plans(), freeTierEntitlements()]);
  return { data, free };
}

export default async function PricingPage() {
  const { data, free } = await loadPricing();
  const groups = compareGroups({
    free,
    freeFullPapersPerMonth: data?.free.full_papers_per_month ?? null,
    papersVisible: FULL_PAPERS,
    adsLive: adsenseReady("display"),
    adsPlanned: /^ca-pub-\d{10,20}$/.test(ADS_CONFIG.client),
  });
  const faq: { q: string; a: string }[] = [
    {
      q: "What stays free?",
      a:
        "Every practice question, step-by-step solutions, bookmarks, the review list, the mistake notebook, progress tracking, the diagnostic and a basic study plan." +
        (FULL_PAPERS && data ? ` Free accounts also get ${data.free.full_papers_per_month} full papers a month.` : ""),
    },
    { q: "Does it renew automatically?", a: "No. Every pass is a single payment. When it ends you go back to Free; your history, bookmarks, plans and results stay." },
    { q: "I already have Plus. Can I buy more?", a: "Yes. A new pass starts when your current one ends, so you never lose days." },
    { q: "Can a parent pay?", a: "Yes. From Account → Billing you can create a payment link and share it. Whoever opens it can pay; Plus is added to your account." },
    { q: "Refunds", a: "See the refund policy. A fully refunded pass is removed from your account." },
  ];

  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing/" },
        ]}
        eyebrow="Pricing"
        title="Free to practise. Plus for the full prep."
        lede="Every question and solution is free, with no daily cap. Plus gives you more room to plan, diagnose and repeat, for one payment that never renews."
      />
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        {data ? (
          <>
            <PricingPlans data={data} groups={groups} highlights={plusHighlights(groups)} />
            <PlanCompare groups={groups} />
          </>
        ) : (
          <EmptyState title="Prices couldn't load" body="We couldn't reach the server just now. Nothing is wrong with your account. Please try again in a minute.">
            <ButtonLink href="/pricing/" variant="secondary" size="sm">
              Retry
            </ButtonLink>
          </EmptyState>
        )}
        <section className="mt-16 max-w-3xl" aria-labelledby="faq">
          <h2 id="faq" className="font-display text-2xl font-semibold">
            Questions
          </h2>
          <dl className="mt-6 divide-y divide-line">
            {faq.map((f) => (
              <div key={f.q} className="py-4">
                <dt className="font-medium">{f.q}</dt>
                <dd className="mt-1 text-fg-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm text-fg-muted">
            Prices are in Indian rupees. Payments are processed by Razorpay. See the <Link className="underline" href="/refund-policy/">refund policy</Link> and{" "}
            <Link className="underline" href="/terms/">terms</Link>.
          </p>
        </section>
      </div>
    </>
  );
}
