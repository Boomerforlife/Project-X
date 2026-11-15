import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { PricingPlans } from "@/components/billing/PricingPlans";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { plans } from "@/lib/api/billing";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: `Pricing: Free and ${SITE.name} Plus`,
  description: `Practice is free. ${SITE.name} Plus adds unlimited full papers and CBT mocks from ₹59 for 30 days. One-time passes, no auto-renewal.`,
  path: "/pricing/",
});

/** Prices are read from the API (server is the source of truth); cached briefly so a price change shows within minutes. */
async function loadPlans() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag("web", "billing:plans");
  return plans();
}

const FAQ: { q: string; a: string }[] = [
  { q: "What stays free?", a: "All practice, solutions, bookmarks, the review list and the mistake notebook. Free accounts also get full papers every month." },
  { q: "Does it renew automatically?", a: "No. Every plan is a one-time pass. When it ends you go back to Free; your history, bookmarks and results stay." },
  { q: "I already have Plus. Can I buy more?", a: "Yes. A new pass starts when your current one ends, so you never lose days." },
  { q: "Can a parent pay?", a: "Yes. From Account → Billing you can create a payment link and share it. Whoever opens it can pay; Plus is added to your account." },
  { q: "Refunds", a: "See the refund policy. A refunded pass is removed from your account." },
];

export default async function PricingPage() {
  const data = await loadPlans();
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Pricing", path: "/pricing/" },
        ]}
        eyebrow="Pricing"
        title="Practice is free. Plus is for full mocks."
        lede="Every question, solution and practice tool is free. Plus removes the monthly limit on full papers and CBT mocks."
      />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {data ? (
          <PricingPlans data={data} />
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
            {FAQ.map((f) => (
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
