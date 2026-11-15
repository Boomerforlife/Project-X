import { Wordmark } from "./Wordmark";
import { DesktopNav, HeaderActions, MobileNav, type NavVariant } from "./NavLinks";

export { Wordmark };

export function SiteHeader({ variant = "site" }: { variant?: NavVariant }) {
  return (
    <header data-chrome className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-bg"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <div className="flex items-center gap-7">
          <Wordmark href={variant === "app" ? "/dashboard/" : "/"} />
          <nav aria-label="Primary" className="hidden lg:block">
            <DesktopNav variant={variant} />
          </nav>
        </div>
        <HeaderActions variant={variant} />
        <MobileNav variant={variant} />
      </div>
    </header>
  );
}
