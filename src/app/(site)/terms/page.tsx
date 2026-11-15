import { PageHeader } from "@/components/layout/PageHeader";
import { Blank, LegalBody, LegalSection } from "@/components/legal/Legal";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

// Draft: not indexed until legal review is complete.
export const metadata = pageMetadata({
  title: "Terms of use",
  description: `Terms for using the ${SITE.name} JEE and NEET practice platform.`,
  path: "/terms/",
  noindex: true,
});

export default function TermsPage() {
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Terms of use", path: "/terms/" },
        ]}
        eyebrow="Legal"
        title="Terms of use"
        lede={`The rules for using ${SITE.name}.`}
      />
      <LegalBody>
        <LegalSection title="Who we are">
          <p>
            {SITE.name} is an online JEE and NEET practice platform operated by{" "}
            <Blank label="Registered company name" />, registered at <Blank label="Registered address" />.
            CIN/LLPIN: <Blank label="CIN/LLPIN, if any" />. GSTIN: <Blank label="GSTIN, if any" />.
          </p>
          <p>
            Effective date: <Blank label="Effective date" />.
          </p>
        </LegalSection>

        <LegalSection title="Plans and payments">
          <p>
            The free plan includes practice, solutions, bookmarks, the review list, the mistake notebook and a
            monthly allowance of full papers.
          </p>
          <p>
            Plus is sold as one-time prepaid passes (30, 90 or 365 days, plus a 30-day launch pass for new
            accounts). Passes do not renew automatically. If you buy a new pass while one is active, it starts
            when the current one ends. Current prices are shown on the pricing page.
          </p>
          <p>
            Payments are processed by Razorpay. We do not store your card, UPI or bank details. A parent or
            guardian may pay through a payment link; the payer must be an adult or have guardian consent. See
            the refund policy for refunds.
          </p>
        </LegalSection>

        <LegalSection title="Answers, solutions and AI">
          <p>
            Explanations written by AI may contain errors, and they are labelled as AI-generated. Always check
            important work against your textbook or teacher.
          </p>
          <p>
            Where we show it, each question and solution carries its source and verification status. We only
            call something official when it comes from official source material.
          </p>
        </LegalSection>

        <LegalSection title="No guarantee of results">
          <p>
            Practice helps, but we do not promise any score, rank, percentile or admission outcome.
          </p>
        </LegalSection>

        <LegalSection title="Acceptable use">
          <ul>
            <li>Do not share your account or resell access to it.</li>
            <li>Do not scrape, copy or redistribute our questions, solutions or other content in bulk.</li>
            <li>Do not attack, overload or probe the service, or try to access other users data.</li>
            <li>Do not use the service for anything unlawful.</li>
          </ul>
        </LegalSection>

        <LegalSection title="Account termination">
          <p>
            You can stop using {SITE.name} and ask us to delete your account at any time. We may suspend or end
            an account that breaks these terms. Refunds on termination follow the refund policy.
          </p>
        </LegalSection>

        <LegalSection title="Limitation of liability">
          <p>
            The service is provided as is. To the extent the law allows, we are not liable for indirect or
            consequential loss, or for loss caused by errors in content, interruptions or events outside our
            control. Nothing here limits liability that cannot be limited by law.
          </p>
        </LegalSection>

        <LegalSection title="Governing law">
          <p>
            These terms are governed by the laws of <Blank label="governing-law jurisdiction" />. Courts at{" "}
            <Blank label="governing-law city/courts" /> have jurisdiction.
          </p>
        </LegalSection>

        <LegalSection title="Contact">
          <p>
            Questions: <Blank label="Support email" />. See the contact page for the grievance officer.
          </p>
        </LegalSection>
      </LegalBody>
    </>
  );
}
