"use client";

import { track } from "@/lib/analytics";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Kitty } from "@/components/brand/Kitty";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {  } from "@/components/ui/Primitives";
import { DemoBadge } from "@/components/app/ModeBadge";
import { demoLogin, useDemo } from "@/lib/demo/store";
import { AUTH_GOOGLE, AUTH_MODE, DEV_USERS } from "@/lib/auth/config";
import { devSignIn, emailSignIn, emailSignUp, googleSignIn } from "@/lib/auth/session";
import { DATA_SOURCE } from "@/lib/site";
import { useSearchParams } from "next/navigation";

/**
 * Login / sign-up UI. The real auth mechanism is a Person 2 decision
 * (docs/api-contract-draft.md), so these forms don't submit anywhere yet —
 * the demo button is the working path.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  if (DATA_SOURCE === "api") return <ApiAuthForm mode={mode} />;
  return <DemoAuthForm mode={mode} />;
}

/** Only same-site paths: never redirect to an attacker-supplied absolute URL. */
function safeNext(v: string | null): string {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard/";
}

function Shell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-4 py-10 sm:px-6 md:grid-cols-[1fr_1.05fr]">
      <div className="hidden md:block">
        <Kitty animated className="w-full max-w-[300px] text-fg" />
      </div>
      <div className="w-full max-w-md md:justify-self-end">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-fg-muted">{sub}</p>
        {children}
      </div>
    </div>
  );
}

const inputCls = "mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-bg px-3 outline-none focus:border-fg";

function ApiAuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const s = useDemo();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const signedIn = Boolean(s?.user);
  const backFromGoogle = useSearchParams().get("oauth") === "1";

  // Returning from Google: once the session is picked up from the URL, continue to where the student was going.
  useEffect(() => {
    if (backFromGoogle && signedIn) router.replace(next);
  }, [backFromGoogle, signedIn, next, router]);

  const done = (r: Awaited<ReturnType<typeof emailSignIn>>) => {
    setBusy(false);
    if (!r.ok) return setError(r.message);
    if (mode === "signup") track("signup_completed");
    if (r.needsEmailConfirmation) return setConfirm(true);
    router.push(next);
  };
  const dev = async (id: (typeof DEV_USERS)[number]["id"]) => {
    setBusy(true);
    setError("");
    done(await devSignIn(id));
  };

  if (confirm) {
    return (
      <Shell title="Check your email" sub={`We sent a confirmation link to ${email}.`}>
        <p role="status" className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm text-fg-soft">
          Open the link to finish creating your account. You can close this tab.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title={mode === "login" ? "Welcome back" : "Start practising"} sub={mode === "login" ? "Pick up where you left off." : "A focused place to practise JEE and NEET questions."}>
      {signedIn && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm">
          You&rsquo;re signed in as <span className="font-medium">{s!.user!.name}</span>.{" "}
          <Link href="/dashboard/" className="underline underline-offset-4">
            Go to your dashboard
          </Link>
        </div>
      )}

      {AUTH_MODE === "dev" && (
        <div className="mt-8 rounded-xl border border-line-strong bg-surface p-5">
          <div className="flex items-center justify-between">
            <p className="font-medium">Development sign-in</p>
            <DemoBadge force>Dev</DemoBadge>
          </div>
          <p className="mt-1 text-sm text-fg-muted">Offline dev accounts for the local API. Not available in production.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {DEV_USERS.map((u) => (
              <Button key={u.id} variant="secondary" disabled={busy} onClick={() => dev(u.id)}>
                Continue as {u.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {AUTH_GOOGLE && (
        <div className="mt-8">
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              const r = await googleSignIn(next);
              if (!r.ok) {
                setBusy(false);
                setError(r.message);
              }
            }}
          >
            Continue with Google
          </Button>
          <p className="mt-6 text-center text-xs uppercase tracking-wide text-fg-muted">or use email</p>
        </div>
      )}

      {AUTH_MODE === "supabase" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            done(mode === "login" ? await emailSignIn(email.trim(), password) : await emailSignUp(email.trim(), password, name.trim() || email.split("@")[0]!));
          }}
          className="mt-8 space-y-3"
        >
          {mode === "signup" && (
            <label className="block text-sm">
              <span className="text-fg-muted">What should we call you?</span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} autoComplete="given-name" className={inputCls} />
            </label>
          )}
          <label className="block text-sm">
            <span className="text-fg-muted">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="text-fg-muted">Password</span>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} className={inputCls} />
          </label>
          <Button type="submit" size="lg" pixel className="w-full" disabled={busy}>
            {busy ? "One moment…" : mode === "login" ? "Log in" : "Create account"}
          </Button>
        </form>
      )}

      {AUTH_MODE === "none" && (
        <p role="status" className="mt-8 rounded-xl border border-review/40 bg-review/5 p-4 text-sm text-fg-soft">
          Sign-in isn&rsquo;t configured for this build yet.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-bad/50 bg-bad/5 p-3 text-sm">
          {error}
        </p>
      )}

      <p className="mt-6 text-center text-sm text-fg-muted">
        {mode === "login" ? (
          <>
            New here?{" "}
            <Link href="/signup/" className="text-fg underline underline-offset-4">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login/" className="text-fg underline underline-offset-4">
              Log in
            </Link>
          </>
        )}
      </p>
    </Shell>
  );
}

function DemoAuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const s = useDemo();
  const [name, setName] = useState("");
  const [note, setNote] = useState(false);
  const enter = () => {
    demoLogin(name.trim() || "Aarav");
    router.push("/onboarding/");
  };
  const signedIn = Boolean(s?.user?.onboarded);

  return (
    <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-4 py-10 sm:px-6 md:grid-cols-[1fr_1.05fr]">
      <div className="hidden md:block">
        <Kitty animated className="w-full max-w-[300px] text-fg" />
      </div>
      <div className="w-full max-w-md md:justify-self-end">
        <h1 className="text-3xl font-semibold">{mode === "login" ? "Welcome back" : "Start practising"}</h1>
        <p className="mt-2 text-fg-muted">{mode === "login" ? "Pick up where you left off." : "A focused place to practise JEE and NEET questions."}</p>

        {signedIn && (
          <div className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm">
            You&rsquo;re already in the demo as <span className="font-medium">{s!.user!.name}</span>.{" "}
            <Link href="/dashboard/" className="underline underline-offset-4">
              Go to your dashboard
            </Link>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-line-strong bg-surface p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <p className="font-medium">Explore the demo</p>
            <DemoBadge />
          </div>
          <p className="mt-1 text-sm text-fg-muted">A sample student with two months of history. Everything stays in this browser.</p>
          {mode === "signup" && (
            <label className="mt-4 block text-sm">
              <span className="text-fg-muted">What should we call you?</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 24))}
                placeholder="Aarav"
                autoComplete="given-name"
                className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-bg px-3 outline-none focus:border-fg"
              />
            </label>
          )}
          <Button size="lg" pixel className="mt-4 w-full" onClick={enter}>
            {mode === "login" ? "Continue with the demo account" : "Create demo account"} <Icon name="arrowRight" className="size-4" />
          </Button>
        </div>

        <div className="my-6 flex items-center gap-3 text-xs text-fg-subtle">
          <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setNote(true);
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            <span className="text-fg-muted">Email</span>
            <input type="email" required autoComplete="email" className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-bg px-3 outline-none focus:border-fg" />
          </label>
          <label className="block text-sm">
            <span className="text-fg-muted">Password</span>
            <input type="password" required autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} className="mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-bg px-3 outline-none focus:border-fg" />
          </label>
          <Button type="submit" variant="secondary" className="w-full">
            {mode === "login" ? "Log in" : "Sign up"}
          </Button>
          {note && (
            <p role="status" className="rounded-lg border border-review/40 bg-review/5 p-3 text-sm text-fg-soft">
              Email accounts aren&rsquo;t connected yet — the backend team owns authentication. Use the demo account above for now.
            </p>
          )}
        </form>
        <p className="mt-6 text-center text-sm text-fg-muted">
          {mode === "login" ? (
            <>
              New here?{" "}
              <Link href="/signup/" className="text-fg underline underline-offset-4">
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/login/" className="text-fg underline underline-offset-4">
                Log in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
