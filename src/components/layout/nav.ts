import type { IconName } from "@/components/ui/Icon";
import { COPY } from "@/lib/copy";
import type { Track } from "@/lib/exams";

/**
 * One navigation for the whole site (UX audit 2026-11-28, section E). The header picks items by auth state, not by
 * route: signing in changes what is personalised, never where things live or what they are called.
 *
 * Signed out: Practice · PYQs · Study plans · Pricing (+ NEET once it is live).
 * Signed in:  Home · Practice · PYQs · Notebook · Progress (Study plan and Account & billing sit in the avatar menu).
 */
export type Audience = "all" | "signedOut" | "signedIn";

export type NavItem = {
  id: string;
  href: string;
  label: string;
  /** Path prefixes that light this item up; the most specific match across the nav wins. */
  match: readonly string[];
  audience: Audience;
  /** `/jee/...` links follow the signed-in student's exam track (`/neet/...` for NEET students). */
  trackScoped?: boolean;
  /** Shown only when this path is not hidden by the layout (e.g. NEET before it has published questions). */
  liveOnly?: boolean;
  icon: IconName;
};

export const NAV: readonly NavItem[] = [
  { id: "home", href: "/dashboard/", label: COPY.home, match: ["/dashboard", "/plan"], audience: "signedIn", icon: "home" },
  { id: "practice", href: "/jee/", label: COPY.practice, match: ["/jee", "/practice"], audience: "all", trackScoped: true, icon: "target" },
  { id: "neet", href: "/neet/", label: "NEET", match: ["/neet"], audience: "signedOut", liveOnly: true, icon: "target" },
  { id: "pyqs", href: "/jee/pyq/", label: COPY.pyqs, match: ["/jee/pyq", "/neet/pyq", "/tests", "/cbt"], audience: "all", trackScoped: true, icon: "layers" },
  { id: "notebook", href: "/mistakes/", label: COPY.notebook, match: ["/mistakes", "/bookmarks", "/review"], audience: "signedIn", icon: "book" },
  { id: "progress", href: "/progress/", label: COPY.progress, match: ["/progress", "/leaderboard", "/results"], audience: "signedIn", icon: "chart" },
  { id: "plans", href: "/study-plans/", label: COPY.studyPlans, match: ["/study-plans"], audience: "signedOut", icon: "list" },
  { id: "pricing", href: "/pricing/", label: COPY.pricing, match: ["/pricing"], audience: "signedOut", icon: "zap" },
];

export type AuthView = "loading" | "signedOut" | "signedIn";

/**
 * Items for an auth state. While the session is still loading only the shared items render (Practice, PYQs), so a
 * signed-in student never sees the signed-out set flash, and crawlers still get the main links in the HTML.
 */
export function navItems(view: AuthView, opts: { track?: Track; hidden?: readonly string[] } = {}): NavItem[] {
  const track = opts.track ?? "jee";
  const hidden = opts.hidden ?? [];
  return NAV.filter((n) => (n.audience === "all" ? true : view !== "loading" && n.audience === view))
    .filter((n) => !(n.liveOnly && hidden.includes(n.href)))
    .map((n) => (n.trackScoped && track !== "jee" ? { ...n, href: n.href.replace(/^\/jee\//, `/${track}/`), match: n.match.map((m) => m.replace(/^\/jee/, `/${track}`)) } : n));
}

export function isActive(pathname: string, match: readonly string[], nav: readonly NavItem[] = NAV) {
  // Most specific match wins: "/jee/pyq" should not also light up "Practice".
  const hit = nav
    .flatMap((n) => n.match.map((m) => ({ m, href: n.href })))
    .filter(({ m }) => pathname === m || pathname.startsWith(m + "/"))
    .sort((a, b) => b.m.length - a.m.length)[0];
  return hit ? match.includes(hit.m) : false;
}
