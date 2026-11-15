import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "./errors";
import { apiFetch } from "./http";
import { publicQuestion } from "./public";

const ORIGINAL_ENV = { ...process.env };

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }, ...init });
}
const errBody = (code: string, message = "m", details?: unknown) => ({ error: { code, message, details, request_id: "r1" } });

describe("apiFetch", () => {
  beforeEach(() => {
    process.env.API_BASE_URL = "http://api.test/api/v1";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("parses the envelope and X-Cache-Tags and sends auth/idempotency headers", async () => {
    const f = vi.fn(async () => json({ data: { n: 1 }, meta: { page: { next_cursor: null, limit: 5 } } }, { headers: { "X-Cache-Tags": "a, b ,c" } }));
    vi.stubGlobal("fetch", f);
    const r = await apiFetch("/x", { schema: z.object({ n: z.number() }), token: "tok", idempotencyKey: "k1", method: "POST", body: { a: 1 } });
    expect(r.data).toEqual({ n: 1 });
    expect(r.tags).toEqual(["a", "b", "c"]);
    expect(r.meta?.page?.limit).toBe(5);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/x");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer tok");
    expect(h["Idempotency-Key"]).toBe("k1");
    expect(init.redirect).toBe("manual");
  });

  it("never sends Authorization when no token is given", async () => {
    const f = vi.fn(async () => json({ data: 1 }));
    vi.stubGlobal("fetch", f);
    await apiFetch("/x", { schema: z.number() });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("turns error envelopes into ApiError with code, requestId and retryAfter", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(errBody("ALREADY_ATTEMPTED"), { status: 409, headers: { "Retry-After": "3" } })));
    const e = await apiFetch("/x", { schema: z.number(), method: "POST" }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, code: "ALREADY_ATTEMPTED", requestId: "r1", retryAfterSec: 3 });
  });

  it("reports contract mismatches as BAD_RESPONSE", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: "nope" })));
    const e = await apiFetch("/x", { schema: z.number() }).catch((x) => x);
    expect(e).toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("returns undefined data for 204", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const r = await apiFetch("/x", { schema: z.undefined(), method: "DELETE" });
    expect(r.status).toBe(204);
    expect(r.data).toBeUndefined();
  });

  it("retries GET on 503 then succeeds, but never retries POST", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(errBody("SERVICE_UNAVAILABLE"), { status: 503, headers: { "Retry-After": "0" } }))
      .mockResolvedValueOnce(json({ data: 7 }));
    vi.stubGlobal("fetch", f);
    expect((await apiFetch("/x", { schema: z.number() })).data).toBe(7);
    expect(f).toHaveBeenCalledTimes(2);

    const g = vi.fn(async () => json(errBody("SERVICE_UNAVAILABLE"), { status: 503 }));
    vi.stubGlobal("fetch", g);
    await expect(apiFetch("/x", { schema: z.number(), method: "POST" })).rejects.toMatchObject({ status: 503 });
    expect(g).toHaveBeenCalledTimes(1);
  });

  it("maps network failures to NETWORK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(apiFetch("/x", { schema: z.number(), retry: 0 })).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("publicQuestion", () => {
  beforeEach(() => {
    process.env.API_BASE_URL = "http://api.test/api/v1";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("surfaces 301 as moved with the new slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(errBody("MOVED_PERMANENTLY", "moved", { slug: "new-slug" }), { status: 301, headers: { Location: "/api/v1/public/questions/new-slug" } })),
    );
    expect(await publicQuestion("old")).toEqual({ status: "moved", slug: "new-slug" });
  });

  it("surfaces 404 as missing and rethrows other errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(errBody("NOT_FOUND"), { status: 404 })));
    expect(await publicQuestion("x")).toEqual({ status: "missing" });
    vi.stubGlobal("fetch", vi.fn(async () => json(errBody("INTERNAL"), { status: 500 })));
    await expect(publicQuestion("x")).rejects.toBeInstanceOf(ApiError);
  });
});
