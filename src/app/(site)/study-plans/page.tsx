import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { EmptyState, PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { pageMetadata } from "@/lib/seo";

// Not indexed until real plan content exists (no thin pages).
export const metadata = pageMetadata({
  title: "JEE Main study plans",
  description: "Structured JEE Main study plans that turn the syllabus into daily, practice-first sessions.",
  path: "/study-plans/",
  noindex: true,
});

export default function StudyPlansPage() {
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Study plans", path: "/study-plans/" },
        ]}
        eyebrow="Plans"
        title="Study plans"
        lede="A plan turns the syllabus into a sequence of daily practice sessions you can actually finish."
      />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <EmptyState
          kitty={<TabbyMascot state="curious" className="h-16 text-fg-subtle" />}
          title="Plans are being written"
          body="We'd rather publish a few plans that work than many that don't. Until they're ready, chapter-wise practice is the best place to start."
        >
          <ButtonLink href="/jee/" variant="secondary" size="sm">
            Browse chapters
          </ButtonLink>
        </EmptyState>
      </div>
    </>
  );
}
