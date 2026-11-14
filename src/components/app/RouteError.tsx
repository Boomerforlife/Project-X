"use client";

import { useEffect } from "react";
import { Kitty } from "@/components/brand/Kitty";
import { Button, ButtonLink } from "@/components/ui/Button";

/** Shared error boundary UI: say what happened, offer a retry and a way home. */
export function RouteError({ error, reset, home = "/" }: { error: Error & { digest?: string }; reset: () => void; home?: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <Kitty pose="lost" className="h-24 w-auto text-fg" />
      <h1 className="mt-8 text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-fg-muted">This page hit an error while loading. Your answers and progress are saved, so trying again is safe.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button pixel onClick={reset}>
          Try again
        </Button>
        <ButtonLink href={home} variant="secondary">
          Go home
        </ButtonLink>
      </div>
      {error.digest && <p className="mt-6 font-mono text-xs text-fg-subtle">Reference {error.digest}</p>}
    </div>
  );
}
