export function sniffImageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const eq = (off: number, sig: number[]): boolean => bytes.length >= off + sig.length && sig.every((b, i) => bytes[off + i] === b);
  if (eq(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (eq(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}
