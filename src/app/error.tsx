"use client";

import { RouteError } from "@/components/app/RouteError";

/** Catches errors in groups without their own boundary (auth, focus) and in group layouts. */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
