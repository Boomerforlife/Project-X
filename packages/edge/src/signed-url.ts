import type { BucketName } from './storage';
import { b64urlDecode, b64urlEncode, hmacSha256, hmacVerify } from './crypto';

const BUCKETS: readonly string[] = ['SOURCE_DOCS', 'PUBLIC_ASSETS', 'USER_UPLOADS'];
const MAX_TTL = 900;
const dec = new TextDecoder();
const enc = new TextEncoder();

/**
 * URL = `${baseUrl}/${token}`, token = base64url(JSON {b,k,e}) + '.' + base64url(HMAC-SHA256(secret, payloadPart)).
 * `e` is expiry in epoch seconds.
 */
export async function signFileUrl(o: {
  secret: string;
  baseUrl: string;
  bucket: BucketName;
  key: string;
  expiresInSec: number;
  now?: number;
}): Promise<string> {
  if (!o.secret) throw new Error('signFileUrl: secret required');
  if (!(o.expiresInSec > 0) || o.expiresInSec > MAX_TTL) throw new Error(`signFileUrl: expiresInSec must be in (0, ${MAX_TTL}]`);
  const nowSec = Math.floor((o.now ?? Date.now()) / 1000);
  const payload = b64urlEncode(enc.encode(JSON.stringify({ b: o.bucket, k: o.key, e: nowSec + Math.floor(o.expiresInSec) })));
  const sig = b64urlEncode(new Uint8Array(await hmacSha256(o.secret, payload)));
  return `${o.baseUrl.replace(/\/+$/, '')}/${payload}.${sig}`;
}

export async function verifyFileToken(o: {
  secret: string;
  token: string;
  now?: number;
}): Promise<{ bucket: BucketName; key: string } | null> {
  try {
    const parts = o.token.split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts as [string, string];
    if (!(await hmacVerify(o.secret, payload, b64urlDecode(sig)))) return null;
    const p = JSON.parse(dec.decode(b64urlDecode(payload))) as { b?: unknown; k?: unknown; e?: unknown };
    if (typeof p.b !== 'string' || !BUCKETS.includes(p.b) || typeof p.k !== 'string' || typeof p.e !== 'number') return null;
    if (Math.floor((o.now ?? Date.now()) / 1000) >= p.e) return null;
    return { bucket: p.b as BucketName, key: p.k };
  } catch {
    return null;
  }
}
