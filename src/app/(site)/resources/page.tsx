import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { GUIDES } from "@/content/guides";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "JEE preparation guides",
  description: "Practical, plain-English guides on JEE preparation: previous year questions, chapter-wise practice, mock test analysis, mistake notebooks and subject strategy.",
  path: "/resources/",
  noindex: GUIDES.length === 0,
});

export default function ResourcesPage() {
  const categories = [...new Set(GUIDES.map((g) => g.category))];
  return (
    <>
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Resources", path: "/resources/" },
        ]}
        eyebrow="Resources"
        title="JEE preparation guides"
        lede="Practical write-ups on how to practise, review and improve. Exam dates, pattern and eligibility change every year, so guides link to the official sources instead of repeating them."
      />
      <div className="mx-auto max-w-6xl space-y-12 px-4 py-14 sm:px-6">
        {categories.map((cat) => (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <h2 id={`cat-${cat}`} className="font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">
              {cat}
            </h2>
            <ul className="mt-4 grid gap-4 md:grid-cols-2">
              {GUIDES.filter((g) => g.category === cat).map((g) => (
                <li key={g.slug}>
                  <Link href={`/resources/${g.slug}/`} className="block h-full rounded-xl border border-line bg-surface p-5 hover:border-line-strong">
                    <h3 className="text-lg font-semibold">{g.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-fg-muted">{g.description}</p>
                    <p className="mt-3 text-xs text-fg-subtle">{g.readingMinutes} min read</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="flex flex-wrap gap-2 border-t border-line pt-8">
          <ButtonLink href="/jee/" size="sm">Start practising</ButtonLink>
          <ButtonLink href="/jee/pyq/" size="sm" variant="secondary">Previous year papers</ButtonLink>
        </div>
      </div>
    </>
  );
}
