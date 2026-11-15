import { Suspense } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        The header's nav reads usePathname(). When a route is regenerated after an on-demand
        revalidation the pathname is runtime data, so it must sit inside a Suspense boundary.
      */}
      <Suspense fallback={<div aria-hidden className="sticky top-0 z-50 h-14 border-b border-line bg-bg" />}>
        <SiteHeader />
      </Suspense>
      <main id="main">{children}</main>
      <Suspense fallback={null}>
        <SiteFooter />
      </Suspense>
    </>
  );
}
