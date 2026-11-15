"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, useTransition } from "react";
import { ErrorScreen, type ErrorKind } from "@/components/states/ErrorScreen";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type RouteErrorProps = {
  error: Error & { digest?: string };
  /** Next 16 `retry()`: re-fetches and re-renders the failed segment. */
  retry: () => void;
  home?: string;
  /** false inside the CBT shell (no mascot there, CLAUDE.md §6C). */
  mascot?: boolean;
};

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** navigator.onLine as React state (assumes online during SSR). */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

const CHUNK_ERROR = /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module/i;
const NETWORK_ERROR = /Failed to fetch|fetch failed|NetworkError|Load failed|ERR_INTERNET_DISCONNECTED/i;

export function classifyError(error: Error & { digest?: string }, online: boolean): ErrorKind {
  const text = `${error.name} ${error.message}`;
  if (!online || NETWORK_ERROR.test(text) || CHUNK_ERROR.test(text)) return "network";
  // A digest means the error was thrown while rendering on the server.
  return error.digest ? "server" : "generic";
}

/** Branded error-boundary UI: say what happened, retry for real, offer a way home. */
export function RouteError({ error, retry, home = "/dashboard/", mascot = true }: RouteErrorProps) {
  const online = useOnline();
  const kind = classifyError(error, online);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const tryAgain = useCallback(() => {
    // A missing JS chunk can't be re-rendered into existence; reload instead.
    if (CHUNK_ERROR.test(`${error.name} ${error.message}`)) {
      window.location.reload();
      return;
    }
    startTransition(() => retry());
  }, [error, retry]);

  // When the connection returns, retry once automatically.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      tryAgain();
    }
  }, [online, tryAgain]);

  return (
    <ErrorScreen
      kind={kind}
      mascot={mascot}
      homeHref={home}
      status={kind === "network" ? <ConnectionStatus online={online} pending={pending} /> : null}
      details={
        kind === "generic" && error.message ? (
          <>Details: {error.message.slice(0, 160)}</>
        ) : error.digest ? (
          <>Reference {error.digest}</>
        ) : null
      }
      actions={
        <>
          <Button pixel onClick={tryAgain} disabled={pending} aria-busy={pending}>
            {pending ? "Trying…" : "Try again"}
          </Button>
          <ButtonLink href={home} variant="secondary">
            Home
          </ButtonLink>
        </>
      }
    />
  );
}

/**
 * Live connection indicator. Only says something when there is something true
 * to say (offline, or retrying); the region keeps its height so nothing jumps.
 */
function ConnectionStatus({ online, pending }: { online: boolean; pending: boolean }) {
  const text = !online ? "Offline · we’ll retry when you reconnect" : pending ? "Reconnecting…" : null;
  return (
    <div role="status" className="mt-6 flex min-h-7 items-center justify-center">
      {text && (
        <p className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-fg-muted">
          <span aria-hidden className={cn("size-1.5 rounded-full", online ? "bg-ok" : "bg-review motion-safe:animate-pulse")} />
          {text}
        </p>
      )}
    </div>
  );
}
