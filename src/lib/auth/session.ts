"use client";

/**
 * Browser auth session. Tokens are only ever handed to the API as Bearer
 * headers; no cookies, no server-side session (docs/INTEGRATION_PLAN.md 2.6).
 */
import { AUTH_MODE, SUPABASE_CONFIG, type DevUserId } from "./config";
import { supabase } from "./supabase";

const DEV_KEY = "projectx-dev-session-v1";

type DevSession = { token: string; user: DevUserId; userId: string; email: string; expiresAt: number };
let dev: DevSession | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readDev(): DevSession | null {
  if (dev && dev.expiresAt > Date.now() + 60_000) return dev;
  try {
    const raw = sessionStorage.getItem(DEV_KEY);
    if (raw) {
      const p = JSON.parse(raw) as DevSession;
      if (p.token && p.expiresAt > Date.now() + 60_000) return (dev = p);
    }
  } catch {
    /* private mode */
  }
  return (dev = null);
}

export type AuthUser = { id: string; email: string | null };

/** Resolves to the current access token (refreshing via Supabase when needed), or null. */
export async function getAccessToken(): Promise<string | null> {
  if (AUTH_MODE === "dev") return readDev()?.token ?? null;
  if (AUTH_MODE === "supabase") {
    const { data } = await supabase().auth.getSession();
    return data.session?.access_token ?? null;
  }
  return null;
}

export async function currentAuthUser(): Promise<AuthUser | null> {
  if (AUTH_MODE === "dev") {
    const d = readDev();
    return d ? { id: d.userId, email: d.email } : null;
  }
  if (AUTH_MODE === "supabase") {
    const { data } = await supabase().auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? null } : null;
  }
  return null;
}

export type AuthResult = { ok: true; needsEmailConfirmation?: boolean } | { ok: false; message: string };

export async function devSignIn(user: DevUserId): Promise<AuthResult> {
  try {
    const res = await fetch("/api/dev/token/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user }) });
    if (!res.ok) return { ok: false, message: "Dev sign-in is unavailable. Is DEV_TEST_JWT_SECRET set?" };
    dev = (await res.json()) as DevSession;
    try {
      sessionStorage.setItem(DEV_KEY, JSON.stringify(dev));
    } catch {
      /* in-memory only */
    }
    emit();
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't reach the dev token route. Check your connection and try again." };
  }
}

export async function emailSignUp(email: string, password: string, displayName: string): Promise<AuthResult> {
  if (AUTH_MODE !== "supabase") return { ok: false, message: "Email accounts are not configured in this build." };
  const { data, error } = await supabase().auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: `${location.origin}/onboarding/` },
  });
  if (error) return { ok: false, message: error.message };
  emit();
  return { ok: true, needsEmailConfirmation: !data.session };
}

export async function emailSignIn(email: string, password: string): Promise<AuthResult> {
  if (AUTH_MODE !== "supabase") return { ok: false, message: "Email accounts are not configured in this build." };
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };
  emit();
  return { ok: true };
}

export type OAuthProvider = "google";

/**
 * Which social providers are switched on in Supabase. Read from the public auth settings endpoint, so the button only appears
 * once the provider is actually enabled (no dead button that lands on a Supabase error page). Cached per page load.
 */
let providersPromise: Promise<Record<OAuthProvider, boolean>> | null = null;
export function enabledProviders(): Promise<Record<OAuthProvider, boolean>> {
  if (AUTH_MODE !== "supabase") return Promise.resolve({ google: false });
  providersPromise ??= fetch(`${SUPABASE_CONFIG.url.replace(/\/$/, "")}/auth/v1/settings`, { headers: { apikey: SUPABASE_CONFIG.key } })
    .then((r) => (r.ok ? (r.json() as Promise<{ external?: Partial<Record<OAuthProvider, boolean>> }>) : {}))
    .then((s) => ({ google: Boolean((s as { external?: Partial<Record<OAuthProvider, boolean>> }).external?.google) }))
    .catch(() => ({ google: false }));
  return providersPromise;
}

/** Redirects the browser to the provider. Comes back to /auth/callback/, which finishes sign-in and continues to `next`. */
export async function oauthSignIn(provider: OAuthProvider, next: string): Promise<AuthResult> {
  if (AUTH_MODE !== "supabase") return { ok: false, message: "Social sign-in is not configured in this build." };
  const { error } = await supabase().auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${location.origin}/auth/callback/?next=${encodeURIComponent(next)}` },
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Name the provider gave us (Google: full_name / name), for a profile that has none yet. */
export async function providerDisplayName(): Promise<string | null> {
  if (AUTH_MODE !== "supabase") return null;
  const { data } = await supabase().auth.getSession();
  const meta = (data.session?.user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const n = (meta.full_name || meta.name || "").trim();
  return n ? n.slice(0, 60) : null;
}

export async function authSignOut() {
  dev = null;
  try {
    sessionStorage.removeItem(DEV_KEY);
  } catch {
    /* ignore */
  }
  if (AUTH_MODE === "supabase") await supabase().auth.signOut().catch(() => undefined);
  emit();
}

/** Subscribe to sign-in / sign-out / token refresh. */
export function onAuthChange(cb: () => void): () => void {
  listeners.add(cb);
  let unsub: (() => void) | null = null;
  if (AUTH_MODE === "supabase") {
    const { data } = supabase().auth.onAuthStateChange(() => cb());
    unsub = () => data.subscription.unsubscribe();
  }
  return () => {
    listeners.delete(cb);
    unsub?.();
  };
}
