import { PageHeader } from "@/components/layout/PageHeader";
import { Blank, LegalBody, LegalSection } from "@/components/legal/Legal";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

// Draft: not indexed until legal review is complete.
export const metadata = pageMetadata({
  title: "Refund policy",
  description: `Refunds for ${SITE.name} Plus passes.`,
  path: "/refund-policy/",
  noindex: true,
});

export default function RefundPolicyPage() {
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Refund policy", path: "/refund-policy/" },
        ]}
        eyebrow="Legal"
        title="Refund policy"
        lede="How refunds work for Plus passes."
      />
      <LegalBody>
        <LegalSection title="What you buy">
          <p>
            Plus passes are one-time prepaid passes (30, 90 or 365 days, plus a 30-day launch pass for new
            accounts). They do not renew automatically, so there is nothing to cancel.
          </p>
        </LegalSection>

        <LegalSection title="Refund window and eligibility">
          <p>
            Refund window: <Blank label="refund window, e.g. N days from purchase" />.
          </p>
          <p>
            Eligibility rules: <Blank label="refund eligibility rules" />.
          </p>
        </LegalSection>

        <LegalSection title="What happens when we refund">
          <p>When a refund is processed, the pass bought with that order is removed from your account.</p>
          <p>Refunds go back through Razorpay to the original payment method.</p>
        </LegalSection>

        <LegalSection title="How to ask">
          <p>
            Write to <Blank label="Support email" /> and include your receipt number (Account, then Billing).
            Effective date: <Blank label="Effective date" />.
          </p>
        </LegalSection>
      </LegalBody>
    </>
  );
}
