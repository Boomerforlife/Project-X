"use client";

import { RouteError } from "@/components/app/RouteError";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} />;
}
