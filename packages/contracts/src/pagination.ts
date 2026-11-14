import { z } from '@hono/zod-openapi';

export const PageMetaSchema = z
  .object({ next_cursor: z.string().nullable(), limit: z.int() })
  .openapi('PageMeta');
export type PageMeta = z.infer<typeof PageMetaSchema>;

export const MetaSchema = z
  .object({ page: PageMetaSchema.optional(), replayed: z.boolean().optional() })
  .openapi('Meta');
export type Meta = z.infer<typeof MetaSchema>;

/** Build a `{ data: T, meta? }` success envelope schema. */
export function envelope<T extends z.ZodType>(data: T) {
  return z.object({ data, meta: MetaSchema.optional() });
}

export const CursorSchema = z.string().max(1000).optional().openapi({ description: 'Opaque cursor from meta.page.next_cursor' });

/** Query params for cursor pagination with a per-endpoint max limit. */
export function pageQuery(max = 100, def = 20) {
  return {
    cursor: CursorSchema,
    limit: z.coerce.number().int().min(1).max(max).default(def).openapi({ description: `1..${max}, default ${def}` }),
  };
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const MAX_SITEMAP_LIMIT = 1000;
