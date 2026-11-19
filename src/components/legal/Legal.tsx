import type { ReactNode } from "react";
import { LEGAL, LEGAL_COMPLETE, type LegalKey } from "@/lib/legal";

/** Obvious placeholder for a company fact we cannot know. Never invent these. */
export function Blank({ label }: { label: string }) {
  return <mark className="rounded bg-yellow-300/20 px-1 font-medium text-yellow-200">[TO FILL: {label}]</mark>;
}

/** A business fact from src/lib/legal.ts, or a visible blank when it has not been filled in. Emails become links. */
export function Fact({ k, label }: { k: LegalKey; label: string }) {
  const v = LEGAL[k];
  if (!v) return <Blank label={label} />;
  const s = String(v);
  if (s.includes("@")) {
    return (
      <a className="text-fg underline underline-offset-2" href={`mailto:${s}`}>
        {s}
      </a>
    );
  }
  return <>{s}</>;
}

export function DraftNotice() {
  if (LEGAL_COMPLETE) return null;
  return (
    <div role="note" className="mb-8 rounded-md border border-yellow-300/40 bg-yellow-300/10 px-4 py-3 text-sm text-fg">
      <strong>Draft for legal review. Not yet in force.</strong>
    </div>
  );
}

export function LegalBody({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <DraftNotice />
      <p className="mb-8 text-sm text-fg-muted">
        Effective date: <Fact k="effectiveDate" label="Effective date" />
      </p>
      <div className="space-y-10">{children}</div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-fg-muted leading-relaxed [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
      <h2 className="text-xl font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

/** "<operator>, based in <address>. <status>" ending with a full stop; optional parts are omitted when empty. */
export function OperatorLine() {
  return (
    <>
      <Fact k="operator" label="Operator: company name, or your name (sole proprietor)" />
      {LEGAL.address ? <>, based in {LEGAL.address}</> : null}
      {LEGAL.cin ? <>. CIN/LLPIN: {LEGAL.cin}</> : null}
      {LEGAL.gstin ? <>. GSTIN: {LEGAL.gstin}</> : null}.{LEGAL.status ? <> {LEGAL.status}</> : null}
    </>
  );
}
