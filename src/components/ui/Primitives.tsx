"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export function Card({ className, children, as: As = "div", ...rest }: { className?: string; children: React.ReactNode; as?: "div" | "section" | "article" | "li" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn("surface", className)} {...rest}>
      {children}
    </As>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("eyebrow", className)}>{children}</p>;
}

/** Segmented "8-bit" progress bar. Value 0..1. */
export function PixelBar({ value, segments = 20, className, colorClass = "bg-fg", label }: { value: number; segments?: number; className?: string; colorClass?: string; label?: string }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * segments);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-label={label}
      className={cn("flex h-2.5 gap-[2px]", className)}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={cn("h-full flex-1 transition-colors duration-300", i < filled ? colorClass : "bg-surface-3")} />
      ))}
    </div>
  );
}

/** Smooth bar for data contexts (subject accuracy etc.). */
export function Bar({ value, className, colorClass = "bg-fg", label }: { value: number; className?: string; colorClass?: string; label?: string }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label} className={cn("h-1.5 overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", colorClass)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 6, className, colorVar = "var(--fg)", children, label }: { value: number; size?: number; stroke?: number; className?: string; colorVar?: string; children?: React.ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colorVar} strokeWidth={stroke} strokeLinecap="butt" strokeDasharray={`${c * v} ${c}`} className="transition-[stroke-dasharray] duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-fg-muted">{sub}</p>}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-2 px-1 font-mono text-[0.68rem] text-fg-soft">{children}</kbd>;
}

export function DemoBadge({ className, children = "Demo" }: { className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded border border-review/40 px-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-review", className)}>
      {children}
    </span>
  );
}

/** Accessible modal built on <dialog>: focus trap, Esc, and backdrop handled by the browser. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dlg-title"
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-line-strong bg-surface p-0 text-fg shadow-[var(--shadow-pop)] backdrop:bg-black/60 backdrop:backdrop-blur-[2px]",
        wide ? "max-w-2xl" : "max-w-md",
        className,
      )}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="dlg-title" className="text-lg font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg">
              <Icon name="x" className="size-4" />
            </button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { id: T; label: React.ReactNode }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full overflow-x-auto no-scrollbar rounded-xl border border-line bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-9 whitespace-nowrap rounded-[9px] px-3.5 text-sm font-medium transition-colors",
            value === o.id ? "bg-surface text-fg shadow-[var(--shadow-card)] ring-1 ring-line-strong" : "text-fg-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn("skeleton", className)} style={style} />;
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-10 w-80 max-w-full" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Skeleton className="h-44 rounded-2xl md:col-span-2" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
      <Skeleton className="mt-4 h-72 rounded-2xl" />
    </div>
  );
}

/** Mirrors the dashboard layout so content doesn't jump when it arrives. */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading your dashboard">
      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-12 w-96 max-w-full" />
          <Skeleton className="mt-3 h-5 w-80 max-w-full" />
          <Skeleton className="mt-8 h-28 rounded-2xl" />
          <Skeleton className="mt-4 h-14 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="mt-14 h-28 rounded-2xl" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/** Rows for question, chapter and paper lists. */
export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-line overflow-hidden rounded-2xl border border-line", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
