/**
 * /llms.txt (llmstxt.org): a short plain-text guide to the site for AI assistants and crawlers. It says the same
 * things the public pages say (no separate content for bots), with counts read from the API, and points to the pages
 * worth reading. Not a ranking signal for Google Search; it helps assistants describe the site correctly.
 */
import { GUIDES } from "@/content/guides";
import { brandFacts, fmt } from "@/lib/brand-facts";
import { PAPERS_VISIBLE } from "@/lib/data";
import { SITE, absoluteUrl } from "@/lib/site";

export async function GET() {
  const facts = await brandFacts().catch(() => []);
  const lines: string[] = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.name} (also written ${SITE.alternateNames.join(", ")}) is an independent JEE preparation website at ${absoluteUrl("/")}. ` +
      "Most questions are previous-year questions from the official papers published by the National Testing Agency (NTA), with answers matched to NTA's final answer key; " +
      "a smaller set are labelled practice questions written for the site. " +
      `${SITE.name} is not affiliated with NTA or any exam body.`,
    "",
  ];
  for (const f of facts) {
    const subjects = f.subjects.filter((s) => s.questions > 0);
    lines.push(`## ${f.name} content`, "");
    lines.push(`- ${fmt(f.questions)} published questions across ${f.chapters.length} chapters (${subjects.map((s) => `${s.name}: ${fmt(s.questions)}`).join(", ")})`);
    for (const p of f.papers) {
      lines.push(`- ${p.exam} previous-year papers: ${p.count}${p.from && p.to ? ` (${p.from === p.to ? p.from : `${p.from}-${p.to}`})` : ""}`);
    }
    lines.push("");
    for (const s of subjects) lines.push(`- [${f.name} ${s.name} chapters](${absoluteUrl(`/${f.track}/${s.id}/`)})`);
    lines.push(`- [${f.name} previous-year papers](${absoluteUrl(`/${f.track}/pyq/`)})`, "");
  }
  lines.push(
    "## Key pages",
    "",
    `- [About ${SITE.name}](${absoluteUrl("/about/")}): what the site is and where its questions come from`,
    `- [JEE practice by subject and chapter](${absoluteUrl("/jee/")})`,
    ...(PAPERS_VISIBLE ? [`- [Full papers in an exam-style CBT](${absoluteUrl("/tests/")})`] : []),
    `- [Free and Plus plans](${absoluteUrl("/pricing/")})`,
    `- [Contact](${absoluteUrl("/contact/")})`,
    "",
    ...(GUIDES.length
      ? ["## Guides", "", ...GUIDES.map((g) => `- [${g.title}](${absoluteUrl(`/resources/${g.slug}/`)}): ${g.description}`), ""]
      : []),
    "## Optional",
    "",
    `- [Sitemap of every public page](${absoluteUrl("/sitemap.xml")})`,
    "",
  );
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
