import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createPgliteDb } from '../pglite';
import { typesOutputFile } from '../paths';
import { generateTypes } from '../typegen';

const { values } = parseArgs({ options: { out: { type: 'string' }, check: { type: 'boolean', default: false } } });
const db = await createPgliteDb({ dataDir: 'memory://', seed: false });
try {
  const text = await generateTypes(db);
  const target = values.out ? path.resolve(values.out) : typesOutputFile;
  if (values.check) {
    const current = await fs.readFile(target, 'utf8').catch(() => '');
    if (current !== text) {
      console.error(`${target} is out of date; run npm run gen:types -w @projectx/db`);
      process.exitCode = 1;
    } else {
      console.log('database types are up to date');
    }
  } else {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text, 'utf8');
    console.log(`wrote ${target}`);
  }
} finally {
  await db.close();
}
