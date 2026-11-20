import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Silkscreen, Space_Grotesk } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AdsProvider } from "@/components/ads/AdsProvider";
import { SiteAdScript } from "@/components/ads/SiteAdScript";
import { AppReady, NavProgress } from "@/components/layout/AppChrome";
import { LoadingScreen } from "@/components/states/Loading";
import { THEME_SCRIPT } from "@/components/theme/theme-script";
import { Toaster } from "@/components/ui/Toast";
import { ADS_CONFIG } from "@/lib/ads/config";
import { DATA_SOURCE, INDEXABLE, SITE } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
// Decorative only — never for stems, solutions or long text (CLAUDE.md §10).
const pixel = Silkscreen({ subsets: ["latin"], weight: "400", variable: "--font-silkscreen", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  robots: INDEXABLE ? undefined : { index: false, follow: true },
  formatDetection: { telephone: false },
  // AdSense site ownership. Emitted whenever a publisher id is set, even with ads off, so Google can verify the site
  // before any ad is shown. The ad script itself loads lazily, only where the placement policy allows.
  ...(/^ca-pub-\d{10,20}$/.test(ADS_CONFIG.client) ? { other: { "google-adsense-account": ADS_CONFIG.client } } : {}),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080808" },
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      data-theme="dark"
      suppressHydrationWarning
      className={`${inter.variable} ${grotesk.variable} ${pixel.variable} antialiased`}
    >
      <head>
        {/* Applies the saved theme before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT + SPLASH_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg text-fg">
        <Splash />
        {/* usePathname() is runtime data; without a boundary, on-demand regeneration of cached routes fails. */}
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <AdsProvider>
          {children}
          {/* AdSense tag on every page that may carry ads (not CBT/tests/checkout/sign-in, not Plus). */}
          <Suspense fallback={null}>
            <SiteAdScript />
          </Suspense>
        </AdsProvider>
        <Toaster />
        <AppReady />
        {DATA_SOURCE === "mock" && <MockRibbon />}
      </body>
    </html>
  );
}

/** Clearly labels mock mode (CLAUDE.md §14). Hidden inside the CBT shell, which shows its own label. */
function MockRibbon() {
  return (
    <div
      role="note"
      className="mock-ribbon pointer-events-none fixed bottom-3 left-3 z-[60] rounded-md border border-review/40 bg-bg/90 px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-review backdrop-blur"
    >
      Demo · mock data
    </div>
  );
}

/** Skip the splash after the first load in a tab, and always in the CBT (no mascot there). */
const SPLASH_SCRIPT = `(function(){try{if(sessionStorage.getItem("tabby-splashed")||location.pathname.indexOf("/cbt")===0)document.documentElement.classList.add("no-splash");}catch(e){}})();`;

/**
 * Branded first-load state: visible only until the app hydrates (see AppReady),
 * never padded with an artificial delay.
 */
function Splash() {
  return (
    <div id="splash" aria-hidden>
      <LoadingScreen fullscreen={false} rotate={false} />
    </div>
  );
}
