import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The web lint covers the Next.js app only, matching the root tsconfig scope
    // (commit 12e71bd). Backend workspaces are checked by their own `tsc --noEmit`.
    "apps/**",
    "packages/**",
    "workers/**",
  ]),
]);

export default eslintConfig;
