"use client";

import type { ReactNode } from "react";
import { useDemo } from "@/lib/demo/store";

/**
 * Renders its children until the browser knows the visitor is signed in. The server and the first client render show
 * the signed-out version (so crawlers and cached HTML see it); a signed-in student then gets it swapped out.
 */
export function SignedOutOnly({ children }: { children: ReactNode }) {
  const s = useDemo();
  return s?.user ? null : <>{children}</>;
}

/** The reverse: nothing on the server, content only once the visitor is known to be signed in. */
export function SignedInOnly({ children }: { children: ReactNode }) {
  const s = useDemo();
  return s?.user ? <>{children}</> : null;
}
