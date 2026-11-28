"use client";

import { NoAds } from "@/components/ads/NoAds";
import { RouteError } from "@/components/app/RouteError";

export default function SiteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <>
      <NoAds />
      <RouteError error={error} retry={retry} />
    </>
  );
}
