import type { Metadata } from "next";
import Link from "next/link";
import { Kitty } from "@/components/brand/Kitty";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <Kitty pose="lost" className="h-32 w-auto text-fg" />
        <p className="mt-10 font-pixel text-xs uppercase tracking-[0.25em] text-fg-muted">Error 404</p>
        <h1 className="mt-3 text-4xl font-semibold">This page wandered off.</h1>
        <p className="mt-3 max-w-md text-fg-muted">
          The link may be old, or the page may have moved. Your practice history is safe.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/jee/" pixel>
            Browse chapters
          </ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Home
          </ButtonLink>
        </div>
        <p className="mt-10 text-sm text-fg-muted">
          Looking for papers? Try <Link href="/jee/pyq/" className="text-fg underline underline-offset-4">previous year questions</Link>.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
