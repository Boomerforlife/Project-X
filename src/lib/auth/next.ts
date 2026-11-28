/**
 * Same-origin path only. Rejects "//host", "/\host" (browsers read a backslash as a slash) and control characters,
 * then confirms the resolved URL stays on this origin. Anything else falls back to the dashboard.
 */
export function safeNext(v: string | null): string {
  const fallback = "/dashboard/";
  if (!v || !v.startsWith("/") || v.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(v)) return fallback;
  try {
    const base = "https://tabby.invalid";
    const u = new URL(v, base);
    return u.origin === base ? `${u.pathname}${u.search}${u.hash}` : fallback;
  } catch {
    return fallback;
  }
}

/** Why sign-in is needed, from where the student was going (shown under the login/sign-up heading). Null when generic. */
export function signInReason(next: string): string | null {
  const p = next.split("?")[0] ?? "";
  if (p.startsWith("/cbt/")) return "Sign in to open your exam.";
  if (/^\/(jee|neet)\/pyq\//.test(p)) return "Sign in to attempt this paper and keep your score.";
  if (/^\/(jee|neet)\/questions\//.test(p)) return "Sign in to save your answers to your progress and mistake notebook.";
  if (/^\/(jee|neet)\/[^/]+\/[^/]+\//.test(p)) return "Sign in to start a session in this chapter.";
  if (p.startsWith("/pricing/") || p.startsWith("/billing/") || p.startsWith("/pay/")) return "Sign in to get Tabby Plus on your account.";
  if (p.startsWith("/plan/") || p.startsWith("/study-plans/")) return "Sign in to see your study plan.";
  if (p.startsWith("/mistakes/") || p.startsWith("/bookmarks/") || p.startsWith("/review/")) return "Sign in to see your Notebook.";
  if (p.startsWith("/progress/") || p.startsWith("/results/")) return "Sign in to see your progress.";
  if (p.startsWith("/practice/")) return "Sign in to continue your practice.";
  if (p.startsWith("/dashboard/")) return "Sign in to see your Home.";
  return null;
}
