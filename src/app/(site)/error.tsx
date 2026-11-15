"use client";

import { RouteError } from "@/components/app/RouteError";

export default function SiteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteError error={error} retry={retry} home="/dashboard/" />;
}
