import { z } from '@hono/zod-openapi';
import { SubjectCodeSchema } from '../enums';
import { SlugSchema, UuidSchema } from '../primitives';

export const ExamRefSchema = z
  .object({ id: UuidSchema, slug: SlugSchema, name: z.string(), short_name: z.string() })
  .openapi('ExamRef');
export type ExamRef = z.infer<typeof ExamRefSchema>;
export const SubjectRefSchema = z
  .object({ id: UuidSchema, slug: SlugSchema, segment: SlugSchema, name: z.string(), code: SubjectCodeSchema })
  .openapi('SubjectRef');
export type SubjectRef = z.infer<typeof SubjectRefSchema>;
export const ChapterRefSchema = z
  .object({ id: UuidSchema, slug: SlugSchema, segment: SlugSchema, name: z.string(), unit_number: z.int().nullable() })
  .openapi('ChapterRef');
export type ChapterRef = z.infer<typeof ChapterRefSchema>;
export const TopicRefSchema = z
  .object({ id: UuidSchema, slug: SlugSchema, segment: SlugSchema, name: z.string() })
  .openapi('TopicRef');
export type TopicRef = z.infer<typeof TopicRefSchema>;
export const BreadcrumbSchema = z.object({ name: z.string(), path: z.string() }).openapi('Breadcrumb');
export type Breadcrumb = z.infer<typeof BreadcrumbSchema>;
