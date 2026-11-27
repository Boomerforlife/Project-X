import Link from "next/link";
import { COPY } from "@/lib/copy";
import { routes } from "@/lib/routes";

type Key = "practice" | "pyqs" | "studyPlans" | "pricing" | "contact" | "resources";

const LINKS: Record<Key, { href: string; label: string }> = {
  practice: { href: routes.practice("jee"), label: `${COPY.practice} by chapter` },
  pyqs: { href: routes.pyq("jee"), label: COPY.pyqs },
  studyPlans: { href: routes.studyPlansInfo, label: COPY.studyPlans },
  pricing: { href: "/pricing/", label: COPY.pricing },
  contact: { href: "/contact/", label: "Contact & help" },
  resources: { href: "/resources/", label: "Guides" },
};

/** A short "where next" row for pages that would otherwise end in a dead end (contact, legal, about). */
export function OnwardLinks({ keys = ["practice", "pyqs", "pricing", "contact"], heading = "Keep going" }: { keys?: Key[]; heading?: string }) {
  return (
    <nav aria-label={heading} className="mt-14 border-t border-line pt-6">
      <p className="font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">{heading}</p>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {keys.map((k) => (
          <li key={k}>
            <Link href={LINKS[k].href} className="inline-flex min-h-11 items-center text-fg-soft underline-offset-4 hover:text-fg hover:underline">
              {LINKS[k].label} <span aria-hidden className="ml-1">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
