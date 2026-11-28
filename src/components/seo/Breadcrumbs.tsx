import Link from "next/link";
import { breadcrumbJsonLd, type Crumb } from "@/lib/seo";
import { JsonLd } from "./JsonLd";

/** Visible breadcrumbs + matching BreadcrumbList JSON-LD (kept in sync by construction). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-fg-muted">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 max-sm:gap-y-0">
          {items.map((c, i) => {
            const last = i === items.length - 1;
            return (
              <li key={c.path} className="flex items-center gap-2">
                {last ? (
                  <span aria-current="page" className="text-fg-soft">{c.name}</span>
                ) : (
                  <>
                    <Link href={c.path} className="inline-flex items-center underline-offset-4 hover:text-fg hover:underline max-sm:min-h-11">
                      {c.name}
                    </Link>
                    <span aria-hidden className="text-fg-subtle">/</span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd data={breadcrumbJsonLd(items)} />
    </>
  );
}
