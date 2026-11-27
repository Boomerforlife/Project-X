import type { Metadata } from "next";
import Link from "next/link";
import { NoAds } from "@/components/ads/NoAds";
import { ErrorScreen } from "@/components/states/ErrorScreen";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * 404 for unmatched URLs and for notFound() anywhere in the app. Renders no
 * site header or footer of its own: inside a group layout, ErrorScreen hides
 * that layout's chrome, so there is exactly one minimal top bar either way.
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
          <ButtonLink href="/dashboard/" variant="secondary">
            Home
          </ButtonLink>
        </>
      }
    >
      <nav aria-label="Popular pages" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <span>Or jump to</span>
        <Link href="/jee/pyq/" className="text-fg underline-offset-4 hover:underline">
          Previous year papers
        </Link>
        <Link href="/practice/" className="text-fg underline-offset-4 hover:underline">
          Practice
        </Link>
        <Link href="/jee/" className="text-fg underline-offset-4 hover:underline">
          JEE chapters
        </Link>
      </nav>
      </ErrorScreen>
    </>
  );
}
