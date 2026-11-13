import { z } from 'zod';

const ALLOWED_KEYS = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'description',
]);

/**
 * z.toJSONSchema post-processed to the Gemini-supported subset (AI_PIPELINE section 3): no $ref/oneOf/anyOf,
 * nullable expressed as type:[x,'null'], no length/format keywords (Zod enforces those after the call).
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: 'draft-7', io: 'output', unrepresentable: 'any' });
  return clean(raw) as Record<string, unknown>;
}

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (node === null || typeof node !== 'object') return node;
  const obj = node as Record<string, unknown>;

  const variants = obj.anyOf ?? obj.oneOf;
  if (Array.isArray(variants)) {
    const nonNull = variants.filter((v) => !(isRecord(v) && v.type === 'null'));
    const hasNull = nonNull.length !== variants.length;
    if (nonNull.length === 1 && isRecord(nonNull[0])) {
      const inner = clean(nonNull[0]) as Record<string, unknown>;
      if (hasNull) inner.type = [innerType(inner.type), 'null'];
      return inner;
    }
    throw new Error('toJsonSchema: unions are not supported by the Gemini schema subset');
  }
  if ('const' in obj) return { type: typeof obj.const === 'number' ? 'number' : 'string', enum: [obj.const] };

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (key === 'properties' && isRecord(value)) {
      out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
    } else if (key === 'items' || key === 'type' || key === 'enum' || key === 'required') {
      out[key] = key === 'items' ? clean(value) : value;
    } else {
      out[key] = value;
    }
  }
  if (out.type === 'object' && isRecord(out.properties)) {
    out.required = Object.keys(out.properties);
  }
  return out;
}

function innerType(t: unknown): unknown {
  return Array.isArray(t) ? t[0] : t;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
