/** Exact decimal-string arithmetic helpers (no floats). Format: /^-?\d+(\.\d+)?$/ */

const DEC_RE = /^-?\d+(\.\d+)?$/;

export function isDecimalString(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 40 && DEC_RE.test(s);
}

interface Parsed {
  neg: boolean;
  int: string; // digits, no leading zeros ('0' if zero)
  frac: string; // digits, no trailing zeros ('' if none)
}

function parse(s: string): Parsed {
  if (!isDecimalString(s)) throw new RangeError(`invalid decimal string: ${JSON.stringify(s)}`);
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [i = '0', f = ''] = body.split('.');
  const int = i.replace(/^0+(?=\d)/, '');
  const frac = f.replace(/0+$/, '');
  const isZero = /^0*$/.test(int) && frac === '';
  return { neg: neg && !isZero, int, frac };
}

function scaled(p: Parsed, scale: number): bigint {
  const digits = p.int + p.frac.padEnd(scale, '0');
  const v = BigInt(digits);
  return p.neg ? -v : v;
}

/** Compare two decimal strings exactly. Returns -1, 0 or 1. Throws RangeError on malformed input. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const pa = parse(a);
  const pb = parse(b);
  const scale = Math.max(pa.frac.length, pb.frac.length);
  const x = scaled(pa, scale);
  const y = scaled(pb, scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Normalise a decimal string: strip leading/trailing zeros, "-0" -> "0". */
export function normalizeDecimal(s: string): string {
  const p = parse(s);
  const body = p.frac ? `${p.int}.${p.frac}` : p.int;
  return p.neg ? `-${body}` : body;
}

/** Negate a decimal string (result normalised). */
export function negateDecimal(s: string): string {
  const p = parse(s);
  const body = p.frac ? `${p.int}.${p.frac}` : p.int;
  if (body === '0') return '0';
  return p.neg ? body : `-${body}`;
}

/** Accepts only a plain decimal string (not numbers) to avoid float round-trips. */
export function inRange(value: string, range: { min: string; max: string }): boolean {
  return compareDecimal(value, range.min) >= 0 && compareDecimal(value, range.max) <= 0;
}
