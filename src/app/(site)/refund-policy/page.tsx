import { PageHeader } from "@/components/layout/PageHeader";
import { Blank, Fact, LegalBody, LegalSection } from "@/components/legal/Legal";
import { LEGAL, LEGAL_COMPLETE } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

// Not indexed until every business fact in src/lib/legal.ts is filled in.
export const metadata = pageMetadata({
  title: "Refund and cancellation policy",
  description: `Refunds, cancellation and delivery for ${SITE.name} Plus passes.`,
  path: "/refund-policy/",
  noindex: !LEGAL_COMPLETE,
});

export default function RefundPolicyPage() {
  const days: number = LEGAL.refundWindowDays;
  const window = days ? `${days} day${days === 1 ? "" : "s"}` : null;
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Refund and cancellation policy", path: "/refund-policy/" },
        ]}
        eyebrow="Legal"
        title="Refund and cancellation policy"
        lede="How cancellation, refunds and delivery work for Plus passes."
      />
      <LegalBody>
        <LegalSection title="What you buy">
          <p>
            Plus passes are one-time prepaid passes for 30, 90 or 365 days, plus a 30-day launch pass for new accounts.
            They do not renew automatically and you are never charged again, so there is no subscription to cancel.
          </p>
        </LegalSection>

        <LegalSection title="Delivery">
          <p>
            {SITE.name} is an online service; nothing is shipped. Your pass is applied to your account automatically,
            usually within a minute of Razorpay confirming the payment. If it has not appeared after 30 minutes, write
            to us with your receipt number and we will fix it.
          </p>
        </LegalSection>

        <LegalSection title="Refunds">
          <ul>
            <li>
              <strong className="text-fg">Change of mind:</strong> you can ask for a full refund within{" "}
              {window ?? <Blank label="refund window in days" />} of buying a pass, for any reason. After that, a pass
              cannot be refunded or cancelled part-way through.
            </li>
            <li>
              <strong className="text-fg">Charged twice, or charged without getting the pass:</strong> always refunded
              in full, whenever you tell us.
            </li>
            <li>
              <strong className="text-fg">If we close the service</strong> or stop offering Plus, we refund the unused
              part of your pass in proportion to the days left.
            </li>
          </ul>
          <p>
            We may refuse a refund where a pass has been abused, for example shared with others or used to copy content
            in bulk.
          </p>
        </LegalSection>

        <LegalSection title="What happens when we refund">
          <p>The pass bought with that order is removed from your account when the refund is processed.</p>
          <p>
            Refunds go back to the original payment method through Razorpay. We start the refund within 2 working days
            of approving it; your bank usually credits it within 5 to 7 working days after that.
          </p>
        </LegalSection>

        <LegalSection title="How to ask">
          <p>
            Write to <Fact k="supportEmail" label="Support email" /> from your account email and include your receipt
            number (Account, then Billing). If a parent or guardian paid, they can write to us directly.
          </p>
        </LegalSection>
      </LegalBody>
    </>
  );
}
