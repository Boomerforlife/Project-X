"use client";

import "./globals.css";
import { RouteError } from "@/components/app/RouteError";

/** Last-resort boundary for errors in the root layout itself. It replaces the whole document. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en-IN" data-theme="dark">
      <body className="min-h-dvh bg-bg text-fg antialiased">
        <title>Something went wrong · Tabby</title>
        <RouteError error={error} retry={retry} home="/dashboard/" />
      </body>
    </html>
  );
}
