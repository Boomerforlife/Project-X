import type { ReactNode } from "react";

/** Obvious placeholder for a company fact we cannot know. Never invent these. */
export function Blank({ label }: { label: string }) {
  return (
    <mark className="rounded bg-yellow-300/20 px-1 font-medium text-yellow-200">
      [TO FILL: {label}]
    </mark>
  );
}

export function DraftNotice() {
  return (
    <div
      role="note"
      className="mb-8 rounded-md border border-yellow-300/40 bg-yellow-300/10 px-4 py-3 text-sm text-fg"
    >
      <strong>Draft for legal review. Not yet in force.</strong>
    </div>
  );
}

export function LegalBody({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <DraftNotice />
      <div className="space-y-10">{children}</div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-fg-muted leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
      <h2 className="text-xl font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}
