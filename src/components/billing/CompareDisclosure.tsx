"use client";
import { useEffect, useRef } from "react";

/**
 * Wraps the full comparison table. Closed on phones (the plan cards above already say what Plus adds, so the table is
 * one tap away instead of a second wall of rows); open on wider screens, where both read well. The table stays in the
 * page HTML either way. Starts closed so it also works without JavaScript.
 */
export function CompareDisclosure({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches && ref.current) ref.current.open = true;
  }, []);
  return (
    <details ref={ref} className="group mt-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-line px-4 text-sm font-medium hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span>Compare all features</span>
        <span aria-hidden className="text-fg-muted transition-transform group-open:rotate-180">
          &#9662;
        </span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}
