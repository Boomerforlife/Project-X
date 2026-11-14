import { err, ok, type Result } from './result';

/** Opaque pagination cursor: sort-key values (strings/numbers/null) plus tie-break id. */
export interface CursorPayload {
  k: (string | number | null)[];
  id: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeCursor(payload: CursorPayload): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify({ k: payload.k, id: payload.id })));
}

export function decodeCursor(cursor: string): Result<CursorPayload, 'INVALID_CURSOR'> {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 1000) return err('INVALID_CURSOR');
    const parsed: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(cursor)));
    if (typeof parsed !== 'object' || parsed === null) return err('INVALID_CURSOR');
    const { k, id } = parsed as { k?: unknown; id?: unknown };
    if (!Array.isArray(k) || typeof id !== 'string') return err('INVALID_CURSOR');
    if (!k.every((x) => x === null || typeof x === 'string' || typeof x === 'number')) return err('INVALID_CURSOR');
    return ok({ k: k as (string | number | null)[], id });
  } catch {
    return err('INVALID_CURSOR');
  }
}
