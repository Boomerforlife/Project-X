export type BucketName = 'SOURCE_DOCS' | 'PUBLIC_ASSETS' | 'USER_UPLOADS';

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType: string;
  etag?: string;
}

export type PutBody = ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>;

export interface ObjectStorage {
  put(key: string, body: PutBody, opts: { contentType: string; cacheControl?: string }): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export type StorageSet = Record<BucketName, ObjectStorage>;

/** Buffer any accepted body into bytes (uploads are capped at 5 MiB, so buffering is fine). */
export async function toBytes(body: PutBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await new Response(body as ReadableStream<Uint8Array>).arrayBuffer());
}

export function bytesToStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** Copy between storages. Content-addressed keys make 'exists' a safe no-op. */
export async function copyObject(
  from: ObjectStorage,
  fromKey: string,
  to: ObjectStorage,
  toKey: string,
  opts?: { cacheControl?: string },
): Promise<'copied' | 'exists'> {
  if (await to.head(toKey)) return 'exists';
  const src = await from.get(fromKey);
  if (!src) throw new Error(`copyObject: source object not found: ${fromKey}`);
  const bytes = await toBytes(src.body);
  const putOpts: { contentType: string; cacheControl?: string } = { contentType: src.contentType };
  if (opts?.cacheControl !== undefined) putOpts.cacheControl = opts.cacheControl;
  await to.put(toKey, bytes, putOpts);
  return 'copied';
}

export function createMemoryStorage(): ObjectStorage {
  const map = new Map<string, { bytes: Uint8Array; contentType: string; etag: string }>();
  let counter = 0;
  return {
    async put(key, body, opts) {
      const bytes = new Uint8Array(await toBytes(body)); // copy
      map.set(key, { bytes, contentType: opts.contentType, etag: `mem-${++counter}` });
    },
    async get(key) {
      const o = map.get(key);
      if (!o) return null;
      return { body: bytesToStream(new Uint8Array(o.bytes)), size: o.bytes.byteLength, contentType: o.contentType, etag: o.etag };
    },
    async head(key) {
      const o = map.get(key);
      return o ? { size: o.bytes.byteLength, contentType: o.contentType } : null;
    },
    async delete(key) {
      map.delete(key);
    },
  };
}
