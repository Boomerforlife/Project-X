import { Suspense } from "react";
import { SiteContentAd } from "@/components/ads/SiteContentAd";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { PublicSiteHeader } from "@/components/layout/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        The header's nav reads usePathname(). When a route is regenerated after an on-demand
        revalidation the pathname is runtime data, so it must sit inside a Suspense boundary.
      */}
      <Suspense fallback={<div aria-hidden className="sticky top-0 z-50 h-14 border-b border-line bg-bg" />}>
        <PublicSiteHeader />
      </Suspense>
      <main id="main">{children}</main>
      {/* Public content pages only (subject/chapter hubs, PYQ hubs, resources); the policy keeps it off the landing,
          pricing, payment and legal pages. Sits after the content, never inside it. */}
      <Suspense fallback={null}>
        <SiteContentAd />
      </Suspense>
      <Suspense fallback={null}>
        <SiteFooter />
      </Suspense>
    </>
  );
}
