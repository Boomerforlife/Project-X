/** Public navigation: discover exams, papers and plans. */
export const PRIMARY_NAV = [
  { href: "/jee/", label: "JEE", match: ["/jee"] },
  { href: "/neet/", label: "NEET", match: ["/neet"] },
  { href: "/jee/pyq/", label: "PYQs", match: ["/jee/pyq", "/neet/pyq"] },
  { href: "/study-plans/", label: "Plans", match: ["/study-plans"] },
  { href: "/resources/", label: "Resources", match: ["/resources"] },
  { href: "/pricing/", label: "Pricing", match: ["/pricing"] },
] as const;

/** Signed-in navigation (CLAUDE.md §9: minimal top nav, practice first). */
export const APP_NAV = [
  { href: "/dashboard/", label: "Home", match: ["/dashboard"] },
  { href: "/practice/", label: "Practice", match: ["/practice"] },
  { href: "/tests/", label: "Papers", match: ["/tests", "/results"] },
  { href: "/mistakes/", label: "Notebook", match: ["/mistakes", "/bookmarks", "/review"] },
  { href: "/progress/", label: "Progress", match: ["/progress", "/leaderboard"] },
] as const;

export type NavItem = { href: string; label: string; match: readonly string[] };

export function isActive(pathname: string, match: readonly string[], nav: readonly NavItem[] = PRIMARY_NAV) {
  // Most specific match wins: "/jee/pyq" should not also light up "JEE".
  const hit = nav
    .flatMap((n) => n.match.map((m) => ({ m, href: n.href })))
    .filter(({ m }) => pathname === m || pathname.startsWith(m + "/"))
    .sort((a, b) => b.m.length - a.m.length)[0];
  return hit ? match.includes(hit.m) : false;
}
