"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageSkeleton } from "@/components/ui/Primitives";
import { demoLogin, retryLoad, useAuthStatus, useDemo } from "@/lib/demo/store";
import type { DemoState } from "@/lib/demo/types";
import { DATA_SOURCE } from "@/lib/site";

const API = DATA_SOURCE === "api";

/** Where to send a signed-out visitor, remembering where they were headed. */
function loginHref(path: string) {
  return `/login/?next=${encodeURIComponent(path)}`;
}

/**
 * Client-side gate (UX only, NOT security: the API enforces authorization,
 * CLAUDE.md §13). Mock mode: demo session. API mode: real session, with
 * redirects to /login/ and /onboarding/ and an honest error state when the
 * server can't be reached.
 */
export function DemoGate({
  children,
  fallback = <PageSkeleton />,
}: {
  children: (s: DemoState & { user: NonNullable<DemoState["user"]> }) => React.ReactNode;
  /** Shape-matched skeleton shown while state hydrates. */
  fallback?: React.ReactNode;
}) {
  const s = useDemo();
  const auth = useAuthStatus();
  const router = useRouter();
  const path = usePathname();
  const needsOnboarding = Boolean(s?.user && !s.user.onboarded);
  const signedOut = API && auth.status === "signedOut";
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding/");
    // Keep the query string (e.g. /practice/new/?slug=…) so the student lands back on the question they picked.
    else if (signedOut) router.replace(loginHref(path + window.location.search));
  }, [needsOnboarding, signedOut, router, path]);
  if (API && auth.status === "error") return <LoadError message={auth.message} />;
  if (s === null || needsOnboarding || signedOut) return <>{fallback}</>;
  if (!s.user) return <DemoRequired />;
  return <>{children(s as DemoState & { user: NonNullable<DemoState["user"]> })}</>;
}

export function LoadError({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center" role="alert">
      <TabbyMascot state="disconnected" className="h-20 text-fg-subtle" />
      <h1 className="mt-6 text-2xl font-semibold">{message || "We couldn't load your account."}</h1>
      <p className="mt-2 text-fg-muted">Nothing was lost. Check your connection and try again.</p>
      <Button className="mt-6" onClick={retryLoad}>
        Try again
      </Button>
    </div>
  );
}

export function DemoRequired() {
  const router = useRouter();
  const path = usePathname();
  if (API) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <TabbyMascot state="curious" className="h-24 text-fg" />
        <h1 className="mt-8 text-3xl font-semibold">Sign in to continue</h1>
        <p className="mt-3 text-fg-muted">Your practice, mistakes and progress are saved to your account.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href={loginHref(path)} size="lg">
            Log in
          </ButtonLink>
          <ButtonLink href="/signup/" size="lg" variant="secondary">
            Create an account
          </ButtonLink>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <TabbyMascot state="curious" className="h-24 text-fg" />
      <h1 className="mt-8 text-3xl font-semibold">Sign in to continue</h1>
      <p className="mt-3 text-fg-muted">
        Accounts aren&rsquo;t connected yet. Enter the demo to explore everything with a sample student profile — it lives only in this browser.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          size="lg"
          pixel
          onClick={() => {
            demoLogin();
            router.push("/onboarding/");
          }}
        >
          Enter the demo
        </Button>
        <ButtonLink href="/" size="lg" variant="secondary">
          Back home
        </ButtonLink>
      </div>
    </div>
  );
}
