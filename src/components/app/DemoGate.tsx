"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PageSkeleton } from "@/components/ui/Primitives";
import { demoLogin, useDemo } from "@/lib/demo/store";
import type { DemoState } from "@/lib/demo/types";

/**
 * Client-side gate for the demo. NOT security: real authorization is enforced
 * by the backend (CLAUDE.md §13). It only decides what to render.
 */
export function DemoGate({
  children,
  fallback = <PageSkeleton />,
}: {
  children: (s: DemoState & { user: NonNullable<DemoState["user"]> }) => React.ReactNode;
  /** Shape-matched skeleton shown while the demo state hydrates. */
  fallback?: React.ReactNode;
}) {
  const s = useDemo();
  const router = useRouter();
  const needsOnboarding = Boolean(s?.user && !s.user.onboarded);
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding/");
  }, [needsOnboarding, router]);
  if (s === null || needsOnboarding) return <>{fallback}</>;
  if (!s.user) return <DemoRequired />;
  return <>{children(s as DemoState & { user: NonNullable<DemoState["user"]> })}</>;
}

export function DemoRequired() {
  const router = useRouter();
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
