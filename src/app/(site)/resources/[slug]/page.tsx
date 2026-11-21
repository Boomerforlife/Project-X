import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { JsonLd } from "@/components/seo/JsonLd";
import { ButtonLink } from "@/components/ui/Button";
import { GUIDES, getGuide } from "@/content/guides";
import type { GuideBlock } from "@/content/guides/types";
import { NOT_FOUND_METADATA, articleJsonLd, pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function generateMetadata({ params }: PageProps<"/resources/[slug]">) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return NOT_FOUND_METADATA;
  return pageMetadata({ title: g.title, description: g.description, path: `/resources/${g.slug}/`, ogType: "article" });
}

function Block({ b }: { b: GuideBlock }) {
  switch (b.type) {
    case "p":
      return <p className="leading-relaxed text-fg-soft">{b.text}</p>;
    case "ul":
      return (
        <ul className="list-disc space-y-2 pl-5 text-fg-soft">
          {b.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal space-y-2 pl-5 text-fg-soft">
          {b.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ol>
      );
    case "note":
      return <p className="rounded-lg border border-line bg-surface p-4 text-sm leading-relaxed text-fg-muted">{b.text}</p>;
    case "link": {
      const external = /^https?:/.test(b.href);
      return (
        <p className="text-fg-soft">
          {b.text}{" "}
          {external ? (
            <a href={b.href} rel="noopener" className="underline underline-offset-4 hover:text-fg">{b.label}</a>
          ) : (
            <Link href={b.href} className="underline underline-offset-4 hover:text-fg">{b.label}</Link>
          )}
        </p>
      );
    }
  }
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default async function GuidePage({ params }: PageProps<"/resources/[slug]">) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();
  const path = `/resources/${g.slug}/`;
  const related = g.related.map(getGuide).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <>
      <JsonLd data={articleJsonLd({ title: g.title, description: g.description, path, published: g.published, updated: g.updated })} />
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Resources", path: "/resources/" },
          { name: g.title, path },
        ]}
        eyebrow={g.category}
        title={g.title}
        lede={g.summary}
      >
        <p className="mt-4 text-xs text-fg-subtle">
          {g.readingMinutes} min read · Published <time dateTime={g.published}>{fmt(g.published)}</time> · Updated <time dateTime={g.updated}>{fmt(g.updated)}</time>
        </p>
      </PageHeader>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_16rem]">
        <article className="min-w-0 max-w-3xl space-y-10">
          {g.sections.map((s) => (
            <section key={s.heading} id={slugify(s.heading)} className="scroll-mt-20 space-y-4">
              <h2 className="text-2xl font-semibold">{s.heading}</h2>
              {s.answer && <p className="text-lg font-medium leading-relaxed">{s.answer}</p>}
              {s.blocks.map((b, i) => (
                <Block key={i} b={b} />
              ))}
            </section>
          ))}
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="text-xl font-semibold">Put it into practice</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {g.practiceLinks.map((l) => (
                <li key={l.href}>
                  <ButtonLink href={l.href} size="sm" variant="secondary">{l.label}</ButtonLink>
                </li>
              ))}
            </ul>
          </section>
        </article>
        <aside className="space-y-8 lg:sticky lg:top-20 lg:self-start">
          <nav aria-label="Table of contents">
            <h2 className="font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">On this page</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {g.sections.map((s) => (
                <li key={s.heading}>
                  <a href={`#${slugify(s.heading)}`} className="text-fg-muted hover:text-fg">{s.heading}</a>
                </li>
              ))}
            </ol>
          </nav>
          {related.length > 0 && (
            <nav aria-label="Related guides">
              <h2 className="font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">Related guides</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/resources/${r.slug}/`} className="text-fg-muted hover:text-fg">{r.title}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>
      </div>
    </>
  );
}
