import { PageHeader } from "@/components/layout/PageHeader";
import { Blank, LegalBody, LegalSection } from "@/components/legal/Legal";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

// Draft: not indexed until legal review is complete.
export const metadata = pageMetadata({
  title: "Contact",
  description: `How to reach ${SITE.name} support and the grievance officer.`,
  path: "/contact/",
  noindex: true,
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
      <LegalBody>
        <LegalSection title="Support">
          <p>
            Email: <Blank label="Support email" />
          </p>
          <p>
            Phone (optional): <Blank label="Phone, optional" />
          </p>
          <p>For payment issues include your receipt number (Account, then Billing).</p>
        </LegalSection>

        <LegalSection title="Grievance officer">
          <p>
            Name: <Blank label="Grievance officer name" />
          </p>
          <p>
            Email: <Blank label="Grievance officer email" />
          </p>
        </LegalSection>

        <LegalSection title="Registered office">
          <p>
            <Blank label="Registered company name" />
          </p>
          <p>
            <Blank label="Registered address" />
          </p>
        </LegalSection>
      </LegalBody>
    </>
  );
}
