import Link from "next/link";
import { PAPERS_VISIBLE, getExams, getSubjects } from "@/lib/data";
import { TRACK_INFO, examLabel } from "@/lib/exams";
import { liveTracks } from "@/lib/live-tracks";
import { SITE } from "@/lib/site";
import { Wordmark } from "./Wordmark";

export async function SiteFooter() {
  // The footer must never take the whole site down: if the API is unreachable, fall back to
  // plain subject links (navigation only, no content) and let the page itself show its error state.
  const fallback = (t: "jee" | "neet") => TRACK_INFO[t].subjects.map((id) => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), summary: "" }));
  const [jee, jeeExams, live] = await Promise.all([
    getSubjects("jee").catch(() => fallback("jee")),
    getExams("jee").catch(() => TRACK_INFO.jee.exams),
    liveTracks(),
  ]);
  // NEET gets a column only once it has published questions (no links to empty or missing pages before that).
  const neet = live.includes("neet") ? await getSubjects("neet").catch(() => []) : [];
  const cols = [
    {
      title: "JEE",
      links: [
        // Name only the exams that have questions ("JEE Main" today), never an exam we do not cover yet.
        { href: "/jee/", label: examLabel("jee", jeeExams) },
        ...jee.map((s) => ({ href: `/jee/${s.id}/`, label: s.name })),
        { href: "/jee/pyq/", label: "JEE papers" },
      ],
    },
    ...(neet.length
      ? [
          {
            title: "NEET",
            links: [
              { href: "/neet/", label: "NEET UG" },
              ...neet.map((s) => ({ href: `/neet/${s.id}/`, label: s.name })),
              { href: "/neet/pyq/", label: "NEET papers" },
            ],
          },
        ]
      : []),
    {
      title: "Study",
      links: [
        ...(PAPERS_VISIBLE ? [{ href: "/tests/", label: "Mock tests" }] : []),
        { href: "/study-plans/", label: "Study plans" },
        { href: "/resources/", label: "Resources" },
        { href: "/pricing/", label: "Pricing" },
        { href: "/login/", label: "Log in" },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "/about/", label: "About" },
        { href: "/contact/", label: "Contact" },
        { href: "/terms/", label: "Terms" },
        { href: "/privacy/", label: "Privacy" },
        { href: "/refund-policy/", label: "Refunds" },
      ],
    },
  ];

  return (
    <footer data-chrome className="mt-24 border-t border-line">
      <div className={`mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 ${cols.length >= 4 ? "md:grid-cols-[1.4fr_repeat(4,1fr)]" : "md:grid-cols-[1.4fr_repeat(3,1fr)]"}`}>
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
          JEE Main and NEET UG are conducted by the National Testing Agency (NTA), and JEE Advanced by the IITs under the Joint Admission
          Board. {SITE.name} is an independent practice platform and is not affiliated with, or endorsed by, any of them. Previous-year
          question papers and official answer keys belong to their publishers and are credited on each question; see the{" "}
          <Link href="/terms/" className="underline-offset-2 hover:underline">
            terms
          </Link>{" "}
          for credits and how to request removal.
        </p>
      </div>
    </footer>
  );
}
