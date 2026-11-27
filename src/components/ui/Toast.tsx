"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

/**
 * Quiet confirmations after an action ("Bookmarked", "Report noted").
 * Announced politely to screen readers; never used for errors that need a
 * decision — those stay inline next to the thing that failed.
 */
type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; icon?: IconName; tone?: "neutral" | "good" | "warn"; action?: ToastAction };

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number) {
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

/** Returns the toast id so a caller can dismiss it early. `action` adds one button (e.g. Undo); `duration` is in ms. */
export function toast(message: string, opts: { icon?: IconName; tone?: Toast["tone"]; action?: ToastAction; duration?: number } = {}): number {
  const { duration, ...rest } = opts;
  const t = { id: ++seq, message, ...rest };
  toasts = [...toasts.slice(-2), t];
  emit();
  window.setTimeout(() => dismissToast(t.id), duration ?? 2600);
  return t.id;
}

const EMPTY: Toast[] = [];

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => EMPTY,
  );
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-8">
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            "toast-in flex items-center gap-2.5 rounded-full border border-line-strong bg-surface px-4 py-2.5 text-sm shadow-[var(--shadow-pop)]",
            t.tone === "good" && "border-ok/40",
            t.tone === "warn" && "border-review/50",
          )}
        >
          {t.icon && <Icon name={t.icon} className={cn("size-4", t.tone === "good" ? "text-ok" : t.tone === "warn" ? "text-review" : "text-fg-muted")} />}
          {t.message}
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.onClick();
                dismissToast(t.id);
              }}
              className="pointer-events-auto -my-2 -mr-2 ml-1 inline-flex min-h-11 items-center rounded-full px-3 font-medium underline underline-offset-2 hover:bg-surface-2"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
