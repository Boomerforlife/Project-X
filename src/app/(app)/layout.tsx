import { SiteHeader } from "@/components/layout/SiteHeader";
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
      <SiteHeader variant="app" />
      <main id="main" className="min-h-[calc(100dvh-3.5rem)] pb-20">
        {children}
      </main>
    </>
  );
}
