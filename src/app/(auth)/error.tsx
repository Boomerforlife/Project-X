"use client";

import { RouteError } from "@/components/app/RouteError";

/** Errors inside this group get the branded error screen with the site header (it has no chrome of its own). */
export default function GroupError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
