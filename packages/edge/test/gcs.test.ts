import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createGcsStorage, type GcsBucketLike, type GcsFileLike } from '../src/gcs';
import { toBytes } from '../src/storage';

function fakeBucket(): { bucket: GcsBucketLike; saves: Array<{ name: string; opts: unknown }> } {
  const files = new Map<string, { data: Uint8Array; contentType: string }>();
  const saves: Array<{ name: string; opts: unknown }> = [];
  const bucket: GcsBucketLike = {
    file(name: string): GcsFileLike {
      return {
        async save(data, opts) {
          saves.push({ name, opts });
          files.set(name, { data, contentType: opts.contentType });
        },
        createReadStream: () => Readable.from([files.get(name)!.data]),
        async getMetadata() {
          const f = files.get(name);
          if (!f) throw Object.assign(new Error('No such object'), { code: 404 });
          return [{ size: String(f.data.byteLength), contentType: f.contentType, etag: 'e1' }];
        },
        async exists() {
          return [files.has(name)];
        },
        async delete() {
          files.delete(name);
        },
      };
    },
  };
  return { bucket, saves };
}

describe('createGcsStorage', () => {
  it('round-trips put/get/head/delete and maps 404 to null', async () => {
    const { bucket, saves } = fakeBucket();
    const s = createGcsStorage(bucket);
    expect(await s.get('a/b.png')).toBeNull();
    expect(await s.head('a/b.png')).toBeNull();
    await s.put('a/b.png', new Uint8Array([1, 2, 3]), { contentType: 'image/png', cacheControl: 'public, max-age=60' });
    expect(saves[0]?.opts).toMatchObject({ contentType: 'image/png', resumable: false, metadata: { cacheControl: 'public, max-age=60' } });
    expect(await s.head('a/b.png')).toEqual({ size: 3, contentType: 'image/png' });
    const got = await s.get('a/b.png');
    expect(got?.contentType).toBe('image/png');
    expect(got?.size).toBe(3);
    expect(Array.from(await toBytes(got!.body))).toEqual([1, 2, 3]);
    await s.delete('a/b.png');
    expect(await s.get('a/b.png')).toBeNull();
  });

  it('rethrows non-404 errors', async () => {
    const bucket: GcsBucketLike = {
      file: () =>
        ({
          getMetadata: async () => {
            throw Object.assign(new Error('boom'), { code: 500 });
          },
        }) as unknown as GcsFileLike,
    };
    await expect(createGcsStorage(bucket).head('x')).rejects.toThrow('boom');
  });
});
