/** Mirrors app_private.strip_latex: remove `$`, `\cmd`, `{`, `}`, `^`, `_` -> spaces; collapse whitespace. */
export function stripLatex(t: string): string {
  return t
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[$\\{}^_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mirrors app_private.slugify: lower; strip_latex; [^a-z0-9]+ -> '-'; trim '-'; left(...,80) trimmed at '-'.
 * Returns '' for input with no alphanumerics (callers substitute a fallback).
 */
export function slugify(text: string): string {
  const base = stripLatex(text.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.slice(0, 80).replace(/^-+|-+$/g, '');
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
