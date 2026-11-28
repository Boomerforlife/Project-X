import type { Metadata } from "next";
import Link from "next/link";
import { NoAds } from "@/components/ads/NoAds";
import { ErrorScreen } from "@/components/states/ErrorScreen";
import { HomeButtonLink } from "@/components/layout/HomeLink";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * 404 for unmatched URLs and for notFound() anywhere in the app. ErrorScreen
 * draws the site header (and hides a group layout's own chrome), so there is
 * exactly one header with the full navigation either way.
 */
export default function NotFound() {
  return (
    <>
      <NoAds />
      <ErrorScreen
      kind="not-found"
      actions={
        <>
          <ButtonLink href="/jee/" pixel>
            Browse chapters
          </ButtonLink>
          <HomeButtonLink variant="secondary">Home</HomeButtonLink>
        </>
      }
    >
      <nav aria-label="Popular pages" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <span>Or jump to</span>
        <Link href="/jee/pyq/" className="inline-flex min-h-11 items-center text-fg underline-offset-4 hover:underline">
          PYQs
        </Link>
        <Link href="/study-plans/" className="inline-flex min-h-11 items-center text-fg underline-offset-4 hover:underline">
          Study plans
        </Link>
        <Link href="/jee/" className="inline-flex min-h-11 items-center text-fg underline-offset-4 hover:underline">
          JEE chapters
        </Link>
      </nav>
      </ErrorScreen>
    </>
  );
}
