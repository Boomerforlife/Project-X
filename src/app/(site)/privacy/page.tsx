import { PageHeader } from "@/components/layout/PageHeader";
import { Blank, LegalBody, LegalSection } from "@/components/legal/Legal";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

// Draft: not indexed until legal review is complete.
export const metadata = pageMetadata({
  title: "Privacy policy",
  description: `How ${SITE.name} collects, uses and protects your data.`,
  path: "/privacy/",
  noindex: true,
});

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Privacy policy", path: "/privacy/" },
        ]}
        eyebrow="Legal"
        title="Privacy policy"
        lede="What we collect, why, and the choices you have."
      />
      <LegalBody>
        <LegalSection title="Who is responsible">
          <p>
            <Blank label="Registered company name" />, <Blank label="Registered address" />, runs {SITE.name}.
            Effective date: <Blank label="Effective date" />.
          </p>
        </LegalSection>

        <LegalSection title="What we store">
          <ul>
            <li>Account email (sign-in uses Supabase Auth with email).</li>
            <li>Profile: display name, target exam, class and daily goal.</li>
            <li>Practice attempts and answers.</li>
            <li>Bookmarks and mistakes.</li>
            <li>
              Payment records: order id, plan, amount, status and Razorpay ids. Payments are processed by
              Razorpay; we do not store card, UPI or bank details.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="Where it is hosted">
          <ul>
            <li>API: Google Cloud, asia-south1 (Mumbai).</li>
            <li>Database: Supabase, Mumbai region.</li>
            <li>Website: Vercel.</li>
          </ul>
        </LegalSection>

        <LegalSection title="Analytics">
          <p>
            We count aggregate events per day. We store no user id and no IP address, and we use no cookies and
            no third-party trackers. We honour Do Not Track and Global Privacy Control.
          </p>
          <p>We do not use advertising networks and we do not sell your data.</p>
        </LegalSection>

        <LegalSection title="Children and students under 18">
          <p>
            Many students are under 18. Under India Digital Personal Data Protection Act, 2023, verifiable
            parental consent is required before processing the personal data of a child. Our mechanism:{" "}
            <Blank label="parental consent mechanism" />.
          </p>
        </LegalSection>

        <LegalSection title="Your rights">
          <p>
            You can ask to access, correct or delete your data by writing to <Blank label="Support email" />.
            You can also contact our grievance officer, <Blank label="Grievance officer name" /> at{" "}
            <Blank label="Grievance officer email" />. We aim to respond within{" "}
            <Blank label="response time" />.
          </p>
        </LegalSection>
      </LegalBody>
    </>
  );
}
