import { Kitty } from "@/components/brand/Kitty";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { pageMetadata } from "@/lib/seo";

// Not indexed until real guides are published (no thin pages).
export const metadata = pageMetadata({
  title: "JEE Main guides and resources",
  description: "Practical guides for JEE Main preparation: how to practise, review mistakes, and attempt full papers.",
  path: "/resources/",
  noindex: true,
});

export default function ResourcesPage() {
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Resources", path: "/resources/" },
        ]}
        eyebrow="Resources"
        title="Guides"
        lede="Short, practical write-ups on preparing for JEE Main, from how to review a mock test to how to keep a useful mistake notebook."
      />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <EmptyState
          kitty={<Kitty pose="sleep" className="h-16 w-auto text-fg-subtle" />}
          title="No guides published yet"
          body="Guides will appear here as they're written and reviewed."
        >
          <ButtonLink href="/jee/" variant="secondary" size="sm">
            Start practising instead
          </ButtonLink>
        </EmptyState>
      </div>
    </>
  );
}
