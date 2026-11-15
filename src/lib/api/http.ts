import type { z } from "zod";
import { envelope, ErrorEnvelopeSchema, type Meta } from "@projectx/contracts";
import { browserBaseUrl, serverBaseUrl } from "./env";
import { ApiError } from "./errors";

export type ApiFetchOptions<S extends z.ZodType> = {
  schema: S;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  idempotencyKey?: string;
  signal?: AbortSignal;
  base?: "server" | "browser";
  /** GET only: retries on 429/503/network. Default 2. */
  retry?: number;
};

export type ApiResult<S extends z.ZodType> = {
  data: z.output<S>;
  meta?: Meta;
  tags: string[];
  status: number;
};

const MAX_RETRY_WAIT_SEC = 5;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function baseFor(base: "server" | "browser" | undefined): string {
  const b = base ?? (typeof window === "undefined" ? "server" : "browser");
  return b === "server" ? serverBaseUrl() : browserBaseUrl();
}

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const n = Number(h);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

async function once<S extends z.ZodType>(path: string, o: ApiFetchOptions<S>): Promise<ApiResult<S>> {
  const base = baseFor(o.base);
  if (!base) throw new ApiError(0, "NETWORK", "API base URL is not configured");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (o.body !== undefined) headers["Content-Type"] = "application/json";
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  if (o.idempotencyKey) headers["Idempotency-Key"] = o.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: o.method ?? "GET",
      headers,
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      signal: o.signal,
      redirect: "manual", // 301 for moved slugs is data, not something to follow
      // Authenticated calls must never be cached; public ones are cached by Next data-cache wrappers.
      ...(o.token ? { cache: "no-store" as const } : {}),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "NETWORK", e instanceof Error ? e.message : "Network error");
  }

  const retryAfterSec = parseRetryAfter(res.headers.get("Retry-After"));
  const tags = (res.headers.get("X-Cache-Tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (res.status === 204) {
    const parsed = o.schema.safeParse(undefined);
    if (!parsed.success) throw new ApiError(204, "BAD_RESPONSE", "Unexpected empty response");
    return { data: parsed.data, tags, status: 204 };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }

  if (!res.ok || res.status === 301) {
    const err = ErrorEnvelopeSchema.safeParse(json);
    if (err.success) {
      const { code, message, details, request_id } = err.data.error;
      throw new ApiError(res.status, code, message, { details, requestId: request_id, retryAfterSec });
    }
    throw new ApiError(res.status, res.status >= 500 ? "SERVICE_UNAVAILABLE" : "BAD_RESPONSE", `Unexpected response (${res.status})`, {
      retryAfterSec,
    });
  }

  const parsed = envelope(o.schema).safeParse(json);
  if (!parsed.success) {
    throw new ApiError(res.status, "BAD_RESPONSE", "Response did not match the contract", {
      details: parsed.error.issues.slice(0, 5),
    });
  }
  const body = parsed.data as { data: z.output<S>; meta?: Meta };
  return { data: body.data, meta: body.meta, tags, status: res.status };
}

export async function apiFetch<S extends z.ZodType>(path: string, opts: ApiFetchOptions<S>): Promise<ApiResult<S>> {
  const isGet = (opts.method ?? "GET") === "GET";
  const maxRetry = isGet ? (opts.retry ?? 2) : 0;
  let attempt = 0;
  for (;;) {
    try {
      return await once(path, opts);
    } catch (e) {
      const retriable =
        e instanceof ApiError && (e.code === "NETWORK" || e.status === 429 || e.status === 503) && attempt < maxRetry;
      if (!retriable) throw e;
      const waitSec = Math.min((e as ApiError).retryAfterSec ?? 0.25 * 2 ** attempt, MAX_RETRY_WAIT_SEC);
      attempt++;
      await sleep(waitSec * 1000);
    }
  }
}
