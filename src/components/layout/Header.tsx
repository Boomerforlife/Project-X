import { BottomTabs, DesktopNav, HeaderActions, MobileNav } from "./NavLinks";
import { HomeWordmark } from "./HomeLink";

/**
 * `chrome={false}` is for error screens: they hide the surrounding layout's chrome (globals.css) and draw this header
 * themselves, so the page still has its navigation.
 */
export function SiteHeader({ hidden = ["/neet/"], chrome = true, tabs = true }: { hidden?: readonly string[]; chrome?: boolean; tabs?: boolean }) {
  return (
    <>
      <header {...(chrome ? { "data-chrome": "" } : {})} className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-bg"
        >
          Skip to content
        </a>
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-7">
            <HomeWordmark />
            <nav aria-label="Primary" className="hidden lg:block">
              <DesktopNav hidden={hidden} />
            </nav>
          </div>
          <HeaderActions />
          <MobileNav hidden={hidden} />
        </div>
      </header>
      {tabs && <BottomTabs />}
    </>
  );
}
