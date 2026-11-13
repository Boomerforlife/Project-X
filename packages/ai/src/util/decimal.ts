const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function isDecimal(s: string): boolean {
  return DECIMAL_RE.test(s);
}

/** Exact decimal compare of two decimal strings (BigInt-scaled). Returns -1, 0, 1. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const pa = parts(a);
  const pb = parts(b);
  const scale = Math.max(pa.frac.length, pb.frac.length);
  const na = toScaled(pa, scale);
  const nb = toScaled(pb, scale);
  return na === nb ? 0 : na < nb ? -1 : 1;
}

function parts(s: string): { neg: boolean; int: string; frac: string } {
  if (!DECIMAL_RE.test(s)) throw new Error(`not a decimal: ${s}`);
  const neg = s.startsWith('-');
  const [int = '0', frac = ''] = (neg ? s.slice(1) : s).split('.');
  return { neg, int, frac };
}

function toScaled(p: { neg: boolean; int: string; frac: string }, scale: number): bigint {
  const n = BigInt(p.int + p.frac.padEnd(scale, '0'));
  return p.neg ? -n : n;
}

/** Normalise an AI-provided number to a plain decimal string, or null when impossible. */
export function normalizeDecimal(raw: string): string | null {
  const s = raw.trim();
  if (DECIMAL_RE.test(s)) return s;
  const n = Number(s);
  if (!Number.isFinite(n) || s === '') return null;
  const fixed = n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  return fixed === '-0' ? '0' : fixed;
}
