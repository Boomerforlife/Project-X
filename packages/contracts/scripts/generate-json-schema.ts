import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from '@hono/zod-openapi';
import { AnswerKeySchema, AnswerResponseSchema, ContentBlocksSchema, NormalizedQuestionSchema, OfficialKeyInSchema, IngestionBundleSchema, OfficialAnswerSchema } from '../src/index';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'json-schema');
mkdirSync(outDir, { recursive: true });

const targets: Record<string, z.ZodType> = {
  'normalized-question': NormalizedQuestionSchema,
  'ingestion-bundle': IngestionBundleSchema,
  'official-key': OfficialKeyInSchema,
  'official-answer': OfficialAnswerSchema,
  'answer-key': AnswerKeySchema,
  'answer-response': AnswerResponseSchema,
  'content-blocks': ContentBlocksSchema,
};

for (const [name, schema] of Object.entries(targets)) {
  const js = z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' });
  const body = { ...js, $id: `https://projectx.local/schemas/${name}.json`, title: name };
  writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`wrote json-schema/${name}.json`);
}
