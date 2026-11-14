"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Kitty } from "@/components/brand/Kitty";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { DemoBadge } from "@/components/ui/Primitives";
import { demoLogin, useDemo } from "@/lib/demo/store";

/**
 * Login / sign-up UI. The real auth mechanism is a Person 2 decision
 * (docs/api-contract-draft.md), so these forms don't submit anywhere yet —
 * the demo button is the working path.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
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
