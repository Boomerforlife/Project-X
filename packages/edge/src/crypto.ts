const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str: string): Uint8Array {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function hmacSha256(secret: string, data: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
}

export async function hmacVerify(secret: string, data: string, sig: Uint8Array): Promise<boolean> {
  // reason: Uint8Array<ArrayBufferLike> vs BufferSource typing under TS 5.9 lib
  return crypto.subtle.verify('HMAC', await hmacKey(secret), sig as unknown as ArrayBuffer, enc.encode(data));
}

/** HMAC-SHA256 hex of an IP address (raw IPs are never stored). */
export async function hashIp(ip: string, secret: string): Promise<string> {
  return toHex(await hmacSha256(secret, ip));
}
