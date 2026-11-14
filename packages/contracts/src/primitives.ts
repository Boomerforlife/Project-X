import { z } from '@hono/zod-openapi';

/** `dec` = decimal string, e.g. "-2.5". Exact arithmetic only (see @projectx/shared compareDecimal). */
export const DecSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .max(20)
  .openapi('Dec', { example: '4' });
export type Dec = z.infer<typeof DecSchema>;

export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(120)
  .openapi('Slug', { example: 'jee-main-physics' });
export type Slug = z.infer<typeof SlugSchema>;

export const UuidSchema = z.uuid();
export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .openapi('DateString', { example: '2026-11-14' });
export type DateString = z.infer<typeof DateStringSchema>;
/** ISO-8601 UTC timestamp string. */
export const TsSchema = z.string().max(40).openapi('Timestamp', { example: '2026-11-14T10:00:00.000Z' });
export type Ts = z.infer<typeof TsSchema>;
