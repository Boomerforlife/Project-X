import { Wordmark } from "@/components/layout/Wordmark";
import { TabbyMascot } from "@/components/mascot/TabbyMascot";
import type { MascotState } from "@/components/mascot/mascot-types";

export type ErrorKind = "not-found" | "server" | "network" | "generic";

export const ERROR_COPY: Record<ErrorKind, { code: string; title: string; description: string; mascot: MascotState }> = {
  "not-found": {
    code: "Error 404",
    title: "This page wandered off.",
    description: "The link may be old, or the page may have moved. Your practice history is safe.",
    mascot: "confused",
  },
  server: {
    code: "Error 500",
    title: "Something went wrong.",
    description: "We hit an unexpected problem. Your progress is safe. Try again in a moment.",
    mascot: "surprised",
  },
  network: {
    code: "Connection lost",
    title: "We lost the connection.",
    description: "Check your internet connection and try again.",
    mascot: "disconnected",
  },
  generic: {
    code: "Unexpected error",
    title: "This page didn’t load properly.",
    description: "Part of the page failed while loading. Your answers and progress are saved, so trying again is safe.",
    mascot: "error",
  },
};

/**
 * Full-screen branded error layout. Presentational and server-safe; the
 * interactive parts (retry, connection status) are passed in by the caller.
 *
 * It renders its own minimal top bar, and globals.css hides any surrounding
 * group-layout chrome while it is mounted, so the navigation never doubles up.
 * `mascot={false}` is for the CBT shell, where the kitty must never appear.
 */
export function ErrorScreen({
  kind,
  title,
  description,
  code,
  actions,
  status,
  details,
  children,
  mascot = true,
  homeHref = "/",
}: {
  kind: ErrorKind;
  title?: string;
  description?: React.ReactNode;
  code?: string;
  /** Primary and secondary buttons. */
  actions?: React.ReactNode;
  /** A live status line, e.g. the connection indicator. */
  status?: React.ReactNode;
  /** Small technical reference shown last (error digest, message). */
  details?: React.ReactNode;
  /** Contextual navigation below the actions. */
  children?: React.ReactNode;
  mascot?: boolean;
  homeHref?: string;
}) {
  const copy = ERROR_COPY[kind];
  return (
    <div data-error-screen={kind} className="flex min-h-dvh flex-col bg-bg text-fg">
      <div className="mx-auto flex h-14 w-full max-w-6xl shrink-0 items-center px-4 sm:px-6">{mascot && <Wordmark href={homeHref} />}</div>
      <section aria-labelledby="error-title" className="flex flex-1 flex-col items-center justify-center px-4 pb-24 pt-4 text-center sm:px-6">
        {mascot && <TabbyMascot state={copy.mascot} className="h-28 text-fg sm:h-36" />}
        <p className="mt-10 font-pixel text-xs uppercase tracking-[0.25em] text-fg-muted">{code ?? copy.code}</p>
        <h1 id="error-title" className="mt-3 text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          {title ?? copy.title}
        </h1>
        <p className="mt-4 max-w-md text-pretty leading-relaxed text-fg-muted">{description ?? copy.description}</p>
        {status}
        {actions && <div className="mt-9 flex flex-wrap justify-center gap-3">{actions}</div>}
        {children && <div className="mt-12 text-sm text-fg-muted">{children}</div>}
        {details && <p className="mt-8 max-w-md break-words font-mono text-xs text-fg-subtle">{details}</p>}
      </section>
    </div>
  );
}
