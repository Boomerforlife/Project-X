import { Suspense } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { PublicSiteHeader } from "@/components/layout/SiteHeader";
import { PRIVATE_METADATA } from "@/lib/seo";

/**
 * Private (signed-in) shell: dashboard, practice discovery, papers, lists,
 * progress, account. Everything under here is noindex. Auth enforcement
 * belongs on the server (Person 2's session API), not in this layout.
 */
export const metadata = PRIVATE_METADATA;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* The same header as the public site: nav depends on auth state, not on the route group. */}
      <Suspense fallback={<div aria-hidden className="sticky top-0 z-50 h-14 border-b border-line bg-bg" />}>
        <PublicSiteHeader />
      </Suspense>
      <main id="main" className="min-h-[calc(100dvh-3.5rem)] pb-20">
        {children}
      </main>
      <Suspense fallback={null}>
        <SiteFooter />
      </Suspense>
    </>
  );
}
