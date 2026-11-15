/**
 * Public (unauthenticated) API calls. Server-safe: no Authorization header is
 * ever sent, so responses stay edge-cacheable and `tags` can feed Next's
 * `cacheTag`.
 */
import { z } from "zod";
import { apiFetch, type ApiResult } from "./http";
import { ApiError } from "./errors";
import {
  PracticeQuestionSchema,
  PublicChapterSchema,
  PublicExamSchema,
  PublicQuestionSchema,
  PublicSubjectSchema,
  QuestionSummarySchema,
  SitemapEntrySchema,
  TaxonomyExamSchema,
  TaxonomyTreeSchema,
  type Meta,
  type PublicQuestion,
} from "./schemas";

type Tagged<T> = { data: T; tags: string[]; meta?: Meta };
const wrap = <T>(r: { data: T; tags: string[]; meta?: Meta }): Tagged<T> => ({
  data: r.data,
  tags: r.tags,
  ...(r.meta ? { meta: r.meta } : {}),
});

const enc = encodeURIComponent;

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

export async function taxonomyExams() {
  return wrap(await apiFetch("/taxonomy/exams", { schema: z.array(TaxonomyExamSchema) }));
}

export async function taxonomyTree(exam: string) {
  return wrap(await apiFetch(`/taxonomy/tree${qs({ exam })}`, { schema: TaxonomyTreeSchema }));
}

export async function publicExam(slug: string) {
  return wrap(await apiFetch(`/public/exams/${enc(slug)}`, { schema: PublicExamSchema }));
}

export async function publicSubject(slug: string) {
  return wrap(await apiFetch(`/public/subjects/${enc(slug)}`, { schema: PublicSubjectSchema }));
}

export async function publicChapter(slug: string, opts: { cursor?: string; limit?: number } = {}) {
  return wrap(
    await apiFetch(`/public/chapters/${enc(slug)}${qs({ cursor: opts.cursor, limit: opts.limit })}`, {
      schema: PublicChapterSchema,
    }),
  );
}

export type PublicQuestionResult =
  | { status: "ok"; data: PublicQuestion; tags: string[] }
  | { status: "moved"; slug: string }
  | { status: "missing" };

export async function publicQuestion(slug: string): Promise<PublicQuestionResult> {
  try {
    const r: ApiResult<typeof PublicQuestionSchema> = await apiFetch(`/public/questions/${enc(slug)}`, {
      schema: PublicQuestionSchema,
    });
    return { status: "ok", data: r.data, tags: r.tags };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === "MOVED_PERMANENTLY") {
        const to = (e.details as { slug?: unknown } | undefined)?.slug;
        if (typeof to === "string" && to.length > 0) return { status: "moved", slug: to };
        throw new ApiError(e.status, "BAD_RESPONSE", "Moved response without a target slug", { requestId: e.requestId });
      }
      if (e.code === "NOT_FOUND") return { status: "missing" };
    }
    throw e;
  }
}

export async function related(slug: string, limit = 4) {
  return wrap(
    await apiFetch(`/public/questions/${enc(slug)}/related${qs({ limit })}`, {
      schema: z.array(QuestionSummarySchema),
    }),
  );
}

export async function sitemapQuestions(cursor?: string, limit = 1000) {
  return wrap(
    await apiFetch(`/public/sitemap/questions${qs({ cursor, limit })}`, {
      schema: z.array(SitemapEntrySchema),
    }),
  );
}

export type PracticeListParams = {
  exam: string;
  subject?: string;
  chapter?: string;
  topic?: string;
  cursor?: string;
  limit?: number;
};

export async function practiceQuestions(params: PracticeListParams) {
  return wrap(
    await apiFetch(`/practice/questions${qs(params)}`, {
      schema: z.array(PracticeQuestionSchema),
    }),
  );
}
