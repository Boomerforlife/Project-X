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
