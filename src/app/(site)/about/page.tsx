import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { OnwardLinks } from "@/components/site/OnwardLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { brandFacts, fmt, type TrackFacts } from "@/lib/brand-facts";
import { PAPERS_VISIBLE } from "@/lib/data";
import { pageMetadata } from "@/lib/seo";
import { SITE, absoluteUrl } from "@/lib/site";

/**
 * /about/: what TabbyPrep is, in plain facts with real counts. This is the page search engines and AI assistants read
 * to learn the brand ("Is TabbyPrep a JEE preparation site?"), so every claim must be true today and nothing is
 * promised. Common questions are visible text only: no FAQPage markup (CLAUDE.md §15).
 */
export const metadata = pageMetadata({
  title: `About ${SITE.name}: JEE previous-year questions by chapter`,
  description: `${SITE.name} (tabbyprep.in) is a JEE preparation website: JEE Main previous-year questions sorted by chapter with official NTA answer keys, timed practice and full papers in an exam-style CBT.`,
  path: "/about/",
});

export default async function AboutPage() {
  const facts = await brandFacts().catch(() => []);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: `About ${SITE.name}`,
          url: absoluteUrl("/about/"),
          about: { "@id": `${SITE.url}/#organization` },
          isPartOf: { "@id": `${SITE.url}/#website` },
        }}
      />
      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "About", path: "/about/" },
        ]}
        eyebrow="About"
        title={`About ${SITE.name}`}
        lede={SITE.description}
      />
      <div className="mx-auto max-w-3xl space-y-12 px-4 py-12 leading-relaxed text-fg-soft sm:px-6 [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-fg">
        <section className="space-y-3">
          <h2>What {SITE.name} is</h2>
          <p>
            {SITE.name} (also written Tabby Prep) is a website for JEE preparation at{" "}
            <Link href="/">tabbyprep.in</Link>. It is built around previous-year questions (PYQs): the questions NTA actually
            set in past JEE Main papers, sorted chapter by chapter so you can practise one topic at a time, check the answer,
            and keep a list of the questions you got wrong.
          </p>
        </section>

        {facts.length > 0 && (
          <section className="space-y-3">
            <h2>What is on the site today</h2>
            {facts.map((f) => (
              <TrackSummary key={f.track} f={f} />
            ))}
          </section>
        )}

        <section className="space-y-3">
          <h2>Where the questions and answers come from</h2>
          <p>
            Most questions are previous-year questions from the official JEE Main papers published by the National Testing
            Agency (NTA), shown as they appear on the paper, and their answers are matched against NTA&rsquo;s final answer
            key. A smaller set are practice questions written for the site; those are labelled as such and say how their
            answer was checked. Each question page shows where its answer comes from, and says so when a written
            step-by-step solution is not available yet. {SITE.name} is not affiliated with NTA or any exam body.
          </p>
        </section>

        <section className="space-y-3">
          <h2>How students use it</h2>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Pick a subject and chapter, then practise its previous-year questions in learning mode (answer shown after each question) or timed test mode.</li>
            {PAPERS_VISIBLE && <li>Sit a complete previous-year paper in an exam-style computer-based test (CBT), with a timer, question palette and mark-for-review.</li>}
            <li>Wrong answers go to a mistake notebook automatically, so you can reattempt them later.</li>
            <li>
              Browse by year on the <Link href="/jee/pyq/">JEE previous-year papers</Link> page, or by chapter from{" "}
              <Link href="/jee/">JEE Physics, Chemistry and Mathematics</Link>.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2>Free and Plus</h2>
          <p>
            Practising chapter questions and checking answers is free. {SITE.name} Plus adds more full papers and extra
            features; the current list and prices are on the <Link href="/pricing/">pricing page</Link>.
          </p>
        </section>

        <section className="space-y-4">
          <h2>Common questions</h2>
          <Qa q={`Is ${SITE.name} an official NTA website?`}>
            No. {SITE.name} is an independent practice site. The question papers and answer keys are published by NTA; {SITE.name}{" "}
            sorts them by chapter for practice.
          </Qa>
          <Qa q="Which exams does it cover?">
            JEE Main previous-year questions in Physics, Chemistry and Mathematics today. Other exams are added only when their
            questions are checked, and appear on the site when they are ready.
          </Qa>
          <Qa q="Are the answers correct?">
            Previous-year answers are checked against NTA&rsquo;s final answer key, and each question page shows its answer
            source. If you think a question or answer is wrong, use the report button on that question or{" "}
            <Link href="/contact/">contact us</Link>.
          </Qa>
        </section>

        <OnwardLinks keys={["practice", "pyqs", "studyPlans", "pricing", "contact"]} />
      </div>
    </>
  );
}

function TrackSummary({ f }: { f: TrackFacts }) {
  const subjects = f.subjects.filter((s) => s.questions > 0);
  return (
    <div className="space-y-2">
      <p>
        <strong className="text-fg">{f.name}:</strong> {fmt(f.questions)} published questions in {subjects.length} subject
        {subjects.length === 1 ? "" : "s"} ({subjects.map((s) => `${s.name} ${fmt(s.questions)}`).join(", ")}), across{" "}
        {f.chapters.length} chapters.
      </p>
      {f.papers.length > 0 && (
        <p>
          Full previous-year papers:{" "}
          {f.papers
            .map((p) => `${p.exam}, ${p.count} paper${p.count === 1 ? "" : "s"}${p.from && p.to ? ` (${p.from === p.to ? p.from : `${p.from}–${p.to}`})` : ""}`)
            .join("; ")}
          .
        </p>
      )}
    </div>
  );
}

function Qa({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-medium text-fg">{q}</h3>
      <p className="mt-1">{children}</p>
    </div>
  );
}
