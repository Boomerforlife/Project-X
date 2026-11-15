import { DATA_SOURCE } from "@/lib/site";

/** True when the app runs against the real API (whole-app switch, never per entity). */
export function apiEnabled(): boolean {
  return DATA_SOURCE === "api";
}

const strip = (u: string) => u.replace(/\/+$/, "");

/** Base URL for server components. `API_BASE_URL` (server only) overrides the public one. */
export function serverBaseUrl(): string {
  return strip(process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "");
}

/** Base URL for browser calls (inlined at build time). */
export function browserBaseUrl(): string {
  return strip(process.env.NEXT_PUBLIC_API_BASE_URL || "");
}

type Flag = "off" | "demo";
const flag = (v: string | undefined): Flag => (v === "demo" ? "demo" : "off");

/** Feature flags for demo-only surfaces. Default "off" in API mode. */
export const flags: { papers: Flag; leaderboard: Flag } = {
  papers: flag(process.env.NEXT_PUBLIC_FEATURE_PAPERS),
  leaderboard: flag(process.env.NEXT_PUBLIC_FEATURE_LEADERBOARD),
};
