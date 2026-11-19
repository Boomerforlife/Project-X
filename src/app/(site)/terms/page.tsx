import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Fact, LegalBody, LegalSection, OperatorLine } from "@/components/legal/Legal";
import { LEGAL, LEGAL_COMPLETE } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

// Not indexed until every business fact in src/lib/legal.ts is filled in.
export const metadata = pageMetadata({
  title: "Terms of use",
  description: `Terms for using the ${SITE.name} JEE and NEET practice platform.`,
  path: "/terms/",
  noindex: !LEGAL_COMPLETE,
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
            {SITE.name} is an online JEE and NEET practice platform run by <OperatorLine /> By creating an account or
            using the site, you agree to these terms and to our <Link href="/privacy/">privacy policy</Link>.
          </p>
        </LegalSection>

        <LegalSection title="Your account">
          <ul>
            <li>
              If you are under 18, a parent or guardian must agree to these terms on your behalf before you create an
              account, and should make any purchase.
            </li>
            <li>Keep your sign-in details private. One account is for one student.</li>
            <li>Give accurate details. You are responsible for activity on your account.</li>
          </ul>
        </LegalSection>

        <LegalSection title="Free plan and Plus passes">
          <p>
            The free plan includes practice, solutions, bookmarks, the review list, the mistake notebook and a monthly
            allowance of full papers. Free accounts may see ads, as described in the privacy policy.
          </p>
          <p>
            Plus is sold as one-time prepaid passes (30, 90 or 365 days, and a 30-day launch pass for new accounts).
            Passes do not renew automatically and nothing is charged again. A pass starts as soon as payment is
            confirmed; if you buy one while another is active, it starts when the current one ends. Current prices are
            shown on the <Link href="/pricing/">pricing page</Link> before you pay.
          </p>
          <p>
            Payments are processed by Razorpay. A parent or guardian may pay through a payment link. Refunds follow the{" "}
            <Link href="/refund-policy/">refund and cancellation policy</Link>.
          </p>
          <p>
            We may change what the free plan or new passes include and how much they cost. A change never shortens or
            reduces a pass you have already bought.
          </p>
        </LegalSection>

        <LegalSection title="Rewarded ads">
          <p>
            We may let you unlock some free features by choosing to watch a short ad. A reward is given only after
            Google reports that the ad finished, and daily and monthly limits apply. Rewards have no cash value, cannot
            be transferred, and may be withdrawn if we detect automation or abuse. We may change or end reward offers.
          </p>
        </LegalSection>

        <LegalSection title="Answers, solutions and AI">
          <p>
            Explanations drafted with AI may contain errors, and they are labelled as AI-generated. Always check
            important work against your textbook or teacher.
          </p>
          <p>
            Where we show it, each question and solution carries its source and verification status. We only call
            something official when it comes from official source material. If you find a mistake, please use the report
            button on the question.
          </p>
        </LegalSection>

        <LegalSection title="No guarantee of results">
          <p>Practice helps, but we do not promise any score, rank, percentile or admission outcome.</p>
        </LegalSection>

        <LegalSection title="Our content">
          <p>
            Previous-year papers are published by the official exam bodies, and we credit their source. Our solutions,
            explanations, organisation of questions, design and software belong to us or our licensors. You may use them
            for your own study. You may not copy, republish or sell them.
          </p>
        </LegalSection>

        <LegalSection title="Acceptable use">
          <ul>
            <li>Do not share your account or resell access to it.</li>
            <li>Do not scrape, copy or redistribute our questions, solutions or other content in bulk.</li>
            <li>Do not use bots or scripts, or try to trigger ad rewards without watching the ad.</li>
            <li>Do not attack, overload or probe the service, or try to access other users&apos; data.</li>
            <li>Do not use the service for anything unlawful.</li>
          </ul>
        </LegalSection>

        <LegalSection title="Ending your account">
          <p>
            You can stop using {SITE.name} at any time and ask us to delete your account by writing to{" "}
            <Fact k="supportEmail" label="Support email" />. We may suspend or close an account that breaks these terms,
            after telling you why unless the law or safety prevents it. Refunds on closure follow the refund and
            cancellation policy.
          </p>
        </LegalSection>

        <LegalSection title="Limitation of liability">
          <p>
            The service is provided as is. To the extent the law allows, we are not liable for indirect or consequential
            loss, or for loss caused by errors in content, interruptions or events outside our control, and our total
            liability to you is limited to the amount you paid us in the 12 months before the claim. Nothing here limits
            liability that cannot be limited by law, or your rights as a consumer.
          </p>
        </LegalSection>

        <LegalSection title="Changes to these terms">
          <p>
            We may update these terms. We will change the effective date above and, for significant changes, tell you in
            the app or by email before they apply.
          </p>
        </LegalSection>

        <LegalSection title="Governing law">
          <p>
            These terms are governed by the laws of India.{" "}
            {LEGAL.courtsCity ? (
              <>Courts at {LEGAL.courtsCity} have jurisdiction</>
            ) : (
              <>Courts in India have jurisdiction</>
            )}
            , without affecting your right to approach a consumer commission where you live.
          </p>
        </LegalSection>

        <LegalSection title="Contact">
          <p>
            Questions: <Fact k="supportEmail" label="Support email" />. Complaints go to the grievance officer listed on
            the <Link href="/contact/">contact page</Link>.
          </p>
        </LegalSection>
      </LegalBody>
    </>
  );
}
