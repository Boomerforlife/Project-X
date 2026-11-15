import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { toBytes, type BucketName, type ObjectStorage } from './storage';

/** Files at `rootDir/<bucket>/<key>`, content type in sidecar `<key>.meta.json`. Dev / operator use only. */
export function createLocalStorage(rootDir: string, bucket: BucketName): ObjectStorage {
  const base = resolve(rootDir, bucket);
  const pathFor = (key: string): string => {
    if (!key || key.includes('\0') || key.startsWith('/') || key.split('/').some((s) => s === '..' || s === '.' || s === '')) {
      throw new Error(`invalid storage key: ${key}`);
    }
    const p = resolve(join(base, ...key.split('/')));
    if (!p.startsWith(base + sep)) throw new Error(`invalid storage key: ${key}`);
    return p;
  };
  const readMeta = async (p: string): Promise<{ contentType: string }> => {
    try {
      return JSON.parse(await readFile(`${p}.meta.json`, 'utf8')) as { contentType: string };
    } catch {
      return { contentType: 'application/octet-stream' };
    }
  };
  return {
    async put(key, body, opts) {
      const p = pathFor(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, await toBytes(body));
      await writeFile(`${p}.meta.json`, JSON.stringify({ contentType: opts.contentType, cacheControl: opts.cacheControl }));
    },
    async get(key) {
      const p = pathFor(key);
      const st = await stat(p).catch(() => null);
      if (!st || !st.isFile()) return null;
      const meta = await readMeta(p);
      return {
        // reason: node:stream/web ReadableStream vs DOM ReadableStream nominal typing
        body: Readable.toWeb(createReadStream(p)) as unknown as ReadableStream<Uint8Array>,
        size: st.size,
        contentType: meta.contentType,
        etag: `${st.size}-${Math.floor(st.mtimeMs)}`,
      };
    },
    async head(key) {
      const p = pathFor(key);
      const st = await stat(p).catch(() => null);
      if (!st || !st.isFile()) return null;
      return { size: st.size, contentType: (await readMeta(p)).contentType };
    },
    async delete(key) {
      const p = pathFor(key);
      await rm(p, { force: true });
      await rm(`${p}.meta.json`, { force: true });
    },
  };
}

export * from './index';
export { createGcsStorage, type GcsBucketLike, type GcsFileLike } from './gcs';
