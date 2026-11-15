import type { NextConfig } from "next";

/** Origin ("https://host[:port]") of a URL-ish env value, or null when unset/invalid. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Content Security Policy (see docs/DEPLOYMENT.md section 5.6).
 *
 * Why script-src is Report-Only: Next injects inline bootstrap scripts whose hashes change every build, plus our theme
 * script and JSON-LD. Enforcing `script-src 'self'` needs a per-request nonce, which needs dynamic rendering (a proxy or
 * middleware setting the nonce). That would defeat cacheComponents/PPR static shells, and Node.js middleware is not
 * supported on OpenNext/Workers. So the strict script policy ships as Content-Security-Policy-Report-Only (it logs
 * violations in the browser console without blocking anything), while the directives that do not depend on scripts are
 * ENFORCED in a separate header. Promote script-src to enforcement only after a nonce/hash strategy is tested on staging.
 * Only emitted for production builds (`next dev` needs eval and websockets for HMR).
 */
function buildCspHeaders(): { key: string; value: string }[] {
  if (process.env.NODE_ENV !== "production") return [];

  // NEXT_PUBLIC_* are inlined at build time, so these origins are fixed per build (one build per environment).
  const connect = new Set<string>(["'self'"]);
  const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_BASE_URL);
  const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (apiOrigin) connect.add(apiOrigin);
  if (supabaseOrigin) connect.add(supabaseOrigin);
  // Razorpay Checkout (pricing, /billing/*, /pay/*): script + iframe + its telemetry endpoint.
  const razorpay = ["https://checkout.razorpay.com", "https://api.razorpay.com", "https://lumberjack.razorpay.com"];
  for (const o of razorpay) connect.add(o);

  const enforced = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"].join("; ");

  const reportOnly = [
    "default-src 'self'",
    "script-src 'self' https://checkout.razorpay.com", // no 'unsafe-inline': inline scripts will be reported (expected until nonce/hash is in place)
    "style-src 'self' 'unsafe-inline'", // React style attributes + KaTeX
    // Question/solution images are served from the public-assets custom domain (origin not known to the web build).
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:", // next/font and KaTeX fonts are self-hosted
    `connect-src ${[...connect].join(" ")}`,
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: enforced },
    { key: "Content-Security-Policy-Report-Only", value: reportOnly },
  ];
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Public URLs use trailing slashes (CLAUDE.md §5); the other form 308-redirects.
  trailingSlash: true,
  poweredByHeader: false,
  transpilePackages: ["@projectx/contracts"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const csp = buildCspHeaders();
    if (csp.length === 0) return [];
    return [
      {
        source: "/:path*",
        headers: [
          ...csp,
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
