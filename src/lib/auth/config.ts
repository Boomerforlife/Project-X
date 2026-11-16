/**
 * Auth configuration (build-time, public values only).
 * `dev` = offline dev tokens from /api/dev/token (never in production).
 * `supabase` = Supabase email + password via the browser client.
 * `none` = neither is configured; sign-in screens say so honestly.
 */
export type AuthMode = "dev" | "supabase" | "none";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const AUTH_MODE: AuthMode =
  process.env.NEXT_PUBLIC_AUTH_MODE === "dev"
    ? "dev"
    : SUPABASE_URL && SUPABASE_KEY
      ? "supabase"
      : "none";

export const SUPABASE_CONFIG = { url: SUPABASE_URL, key: SUPABASE_KEY } as const;

/** "Continue with Google" shows only once the Google provider is configured in Supabase (build-time flag). */
export const AUTH_GOOGLE = AUTH_MODE === "supabase" && process.env.NEXT_PUBLIC_AUTH_GOOGLE === "on";

export const DEV_USERS = [
  { id: "dev1", label: "Dev One" },
  { id: "dev2", label: "Dev Two" },
] as const;
export type DevUserId = (typeof DEV_USERS)[number]["id"] | "admin";
