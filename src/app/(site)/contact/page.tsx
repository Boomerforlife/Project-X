import { PageHeader } from "@/components/layout/PageHeader";
import { Fact, LegalBody, LegalSection, OperatorLine } from "@/components/legal/Legal";
import { LEGAL, LEGAL_COMPLETE } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

// Not indexed until every business fact in src/lib/legal.ts is filled in.
export const metadata = pageMetadata({
  title: "Contact",
  description: `How to reach ${SITE.name} support and the grievance officer.`,
  path: "/contact/",
  noindex: !LEGAL_COMPLETE,
});

export default function ContactPage() {
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact/" },
        ]}
        eyebrow="Support"
        title="Contact"
        lede="Questions, payment issues and complaints."
      />
      <LegalBody onward={["practice", "pyqs", "pricing", "resources"]}>
        <LegalSection title="Support">
          <p>
            Email: <Fact k="supportEmail" label="Support email" />
          </p>
          {LEGAL.phone ? <p>Phone: {LEGAL.phone}</p> : null}
          <p>
            We reply within 2 working days. For payment issues, include your receipt number (Account, then Billing). To
            report a mistake in a question, use the report button on that question.
          </p>
        </LegalSection>

        <LegalSection title="Grievance officer">
          <p>For complaints about the service or about your personal data, contact our grievance officer:</p>
          <p>
            {LEGAL.grievanceOfficer ? (
              <>
                Name: {LEGAL.grievanceOfficer}
                <br />
              </>
            ) : null}
            Email: <Fact k="grievanceEmail" label="Grievance officer email" />
          </p>
          <p>We acknowledge complaints within 48 hours and resolve them within {LEGAL.grievanceResponseDays} days.</p>
        </LegalSection>

        <LegalSection title="Operator">
          <p>
            <OperatorLine />
          </p>
          {LEGAL.established ? <p>Established {LEGAL.established}.</p> : null}
        </LegalSection>
      </LegalBody>
    </>
  );
}
