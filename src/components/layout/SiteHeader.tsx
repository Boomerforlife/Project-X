import Link from "next/link";
import { KittyMark } from "@/components/brand/Kitty";
import { SITE } from "@/lib/site";
import { DesktopNav, HeaderActions, MobileNav, type NavVariant } from "./NavLinks";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 rounded-md" aria-label={`${SITE.name} home`}>
      <KittyMark className="h-5 w-auto text-fg transition-transform group-hover:-rotate-6" />
      <span className="font-display text-[1.05rem] font-semibold tracking-tight">{SITE.name}</span>
    </Link>
  );
}

export function SiteHeader({ variant = "site" }: { variant?: NavVariant }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
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
