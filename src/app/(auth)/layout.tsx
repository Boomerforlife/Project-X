import { Wordmark } from "@/components/layout/SiteHeader";
import { ThemeToggle } from "@/components/theme/Theme";
import { PRIVATE_METADATA } from "@/lib/seo";

export const metadata = PRIVATE_METADATA;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header data-chrome className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
