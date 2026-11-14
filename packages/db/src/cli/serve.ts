import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createPgliteDb } from '../pglite';
import { defaultPgliteDataDir } from '../paths';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: process.env.PGLITE_PORT ?? '54322' },
    host: { type: 'string', default: '127.0.0.1' },
    'data-dir': { type: 'string', default: process.env.PGLITE_DATA_DIR ?? defaultPgliteDataDir },
    'no-fixtures': { type: 'boolean', default: false },
    'no-seed': { type: 'boolean', default: false },
  },
});

const port = Number(values.port);
const host = String(values.host);

const db = await createPgliteDb({
  dataDir: String(values['data-dir']),
  migrate: true,
  seed: !values['no-seed'],
  fixtures: !values['no-fixtures'],
});

const server = new PGLiteSocketServer({ db: db.pg, port, host, maxConnections: 1 });
await server.start();
console.log(`[projectx-db] PGlite ready: postgres://postgres:postgres@${host}:${port}/postgres  (data: ${String(values['data-dir'])}, single connection)`);

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log('[projectx-db] shutting down...');
  await server.stop();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
