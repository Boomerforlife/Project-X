/**
 * Admin overview client (GET /admin/metrics, schema in packages/contracts/src/dto/admin-metrics.ts). Browser-only.
 * The API enforces the ADMIN role; this module only attaches the signed-in user's token.
 */
import { z } from "zod";
import { AdminMetricsSchema } from "@projectx/contracts";
import { getToken } from "./auth";
import { browserBaseUrl } from "./env";
import { ApiError } from "./errors";
import { apiFetch } from "./http";

export async function adminMetrics() {
  const token = await getToken();
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Not signed in");
  return (await apiFetch("/admin/metrics", { schema: AdminMetricsSchema, token, base: "browser", retry: 1 })).data;
}

const HealthSchema = z.object({ data: z.object({ status: z.string(), version: z.string().optional(), db: z.string().optional() }) });
export type ApiHealth = { ok: boolean; status: string; db: string | null; version: string | null; ms: number };

/** Live API health as the browser sees it (public endpoint, no token). */
export async function apiHealth(): Promise<ApiHealth> {
  const t0 = performance.now();
  try {
    const r = await fetch(`${browserBaseUrl()}/health`, { cache: "no-store" });
    const ms = Math.round(performance.now() - t0);
    const parsed = HealthSchema.safeParse(await r.json());
    if (!r.ok || !parsed.success) return { ok: false, status: `HTTP ${r.status}`, db: null, version: null, ms };
    const d = parsed.data.data;
    return { ok: d.status === "ok" && (d.db ?? "ok") === "ok", status: d.status, db: d.db ?? null, version: d.version ?? null, ms };
  } catch {
    return { ok: false, status: "unreachable", db: null, version: null, ms: Math.round(performance.now() - t0) };
  }
}
