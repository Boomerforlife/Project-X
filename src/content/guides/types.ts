/**
 * Editorial guides (served at /resources/[slug]/). Plain typed data, no CMS, no MDX dependency.
 * Rules: evergreen only; no invented statistics, credentials or exam rules. Anything that changes by year
 * (dates, pattern, syllabus, fees, eligibility) must point readers to the official NTA / JoSAA sources.
 */
export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "note"; text: string }
  | { type: "link"; text: string; href: string; label: string };

export type GuideSection = {
  /** Used as the H2 and, via slugify, the in-page anchor. Question-style headings are encouraged where natural. */
  heading: string;
  /** 1-2 sentence direct answer shown first (quotable by search/answer engines). */
  answer?: string;
  blocks: GuideBlock[];
};

export type Guide = {
  slug: string;
  title: string;
  description: string;
  category: "Strategy" | "Physics" | "Chemistry" | "Mathematics" | "Practice" | "Exam basics";
  published: string; // ISO date
  updated: string; // ISO date
  readingMinutes: number;
  /** Short direct answer to the title's question, shown at the top. */
  summary: string;
  sections: GuideSection[];
  /** Internal links to practice pages, e.g. "/jee/physics/". */
  practiceLinks: { label: string; href: string }[];
  /** Slugs of related guides. */
  related: string[];
};
