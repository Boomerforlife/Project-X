import Link from "next/link";
import { getSubjects } from "@/lib/data";
import { SITE } from "@/lib/site";
import { Wordmark } from "./Wordmark";

export async function SiteFooter() {
  const subjects = await getSubjects();
  const jee = subjects.filter((s) => s.id !== "biology");
  const cols = [
    {
      title: "JEE",
      links: [
        { href: "/jee/", label: "JEE Main & Advanced" },
        ...jee.map((s) => ({ href: `/jee/${s.id}/`, label: s.name })),
        { href: "/jee/pyq/", label: "JEE papers" },
      ],
    },
    {
      title: "NEET",
      links: [
        { href: "/neet/", label: "NEET UG" },
        { href: "/neet/biology/", label: "Biology" },
        { href: "/neet/physics/", label: "Physics" },
        { href: "/neet/pyq/", label: "NEET papers" },
      ],
    },
    {
      title: "Study",
      links: [
        { href: "/tests/", label: "Mock tests" },
        { href: "/study-plans/", label: "Study plans" },
        { href: "/resources/", label: "Resources" },
        { href: "/login/", label: "Log in" },
      ],
    },
  ];

  return (
    <footer data-chrome className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Wordmark />
          <p className="max-w-xs text-sm text-fg-muted">{SITE.tagline}.</p>
        </div>
        {cols.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="mb-3 font-pixel text-[0.7rem] uppercase tracking-widest text-fg-subtle">{col.title}</h2>
            <ul className="space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-fg-muted hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-fg-subtle sm:px-6">
          JEE Main and NEET UG are conducted by the National Testing Agency, and JEE Advanced by the IITs. {SITE.name} is an independent
          practice platform and is not affiliated with either.
        </p>
      </div>
    </footer>
  );
}
