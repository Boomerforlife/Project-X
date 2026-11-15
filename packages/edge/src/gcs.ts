import { Readable } from 'node:stream';
import { toBytes, type ObjectStorage } from './storage';

/**
 * Structural subset of `@google-cloud/storage`'s Bucket/File, so this module needs no SDK import
 * (the API server passes `new Storage().bucket(name)`; tests pass a fake).
 */
export interface GcsFileLike {
  save(data: Uint8Array, opts: { contentType: string; resumable: false; metadata?: { cacheControl?: string } }): Promise<unknown>;
  createReadStream(): NodeJS.ReadableStream;
  getMetadata(): Promise<[{ size?: string | number; contentType?: string; etag?: string }, ...unknown[]]>;
  exists(): Promise<[boolean]>;
  delete(opts?: { ignoreNotFound?: boolean }): Promise<unknown>;
}
export interface GcsBucketLike {
  file(name: string): GcsFileLike;
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 404;
}

/** Google Cloud Storage adapter implementing the same ObjectStorage contract as R2/local/memory. */
export function createGcsStorage(bucket: GcsBucketLike): ObjectStorage {
  return {
    async put(key, body, opts) {
      const bytes = await toBytes(body);
      const metadata = opts.cacheControl !== undefined ? { cacheControl: opts.cacheControl } : undefined;
      await bucket.file(key).save(bytes, { contentType: opts.contentType, resumable: false, ...(metadata ? { metadata } : {}) });
    },
    async get(key) {
      const f = bucket.file(key);
      let meta: Awaited<ReturnType<GcsFileLike['getMetadata']>>[0];
      try {
        [meta] = await f.getMetadata();
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
      // reason: node:stream/web ReadableStream vs DOM ReadableStream nominal typing
      const body = Readable.toWeb(Readable.from(f.createReadStream() as AsyncIterable<Uint8Array>)) as unknown as ReadableStream<Uint8Array>;
      const out: { body: ReadableStream<Uint8Array>; size: number; contentType: string; etag?: string } = {
        body,
        size: Number(meta.size ?? 0),
        contentType: meta.contentType ?? 'application/octet-stream',
      };
      if (meta.etag) out.etag = meta.etag;
      return out;
    },
    async head(key) {
      try {
        const [meta] = await bucket.file(key).getMetadata();
        return { size: Number(meta.size ?? 0), contentType: meta.contentType ?? 'application/octet-stream' };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async delete(key) {
      await bucket.file(key).delete({ ignoreNotFound: true });
    },
  };
}
