"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { THEME_KEY } from "./theme-script";

export type ThemePref = "dark" | "light" | "system";
const KEY = THEME_KEY;

export { THEME_SCRIPT } from "./theme-script";

const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

function resolve(p: ThemePref): "dark" | "light" {
  if (p !== "system") return p;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function setThemePref(p: ThemePref) {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* still apply for this session */
  }
  const root = document.documentElement;
  root.classList.add("theme-fade");
  root.dataset.theme = resolve(p);
  window.setTimeout(() => root.classList.remove("theme-fade"), 250);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const mq = matchMedia("(prefers-color-scheme: light)");
  const onMq = () => {
    if (readPref() === "system") setThemePref("system");
  };
  mq.addEventListener("change", onMq);
  window.addEventListener("storage", l);
  return () => {
    listeners.delete(l);
    mq.removeEventListener("change", onMq);
    window.removeEventListener("storage", l);
  };
}

export function useThemePref(): ThemePref | null {
  return useSyncExternalStore(subscribe, readPref, () => null);
}

/** Header toggle: flips between dark and light. Full choice (incl. system) lives in Account. */
export function ThemeToggle({ className }: { className?: string }) {
  const pref = useThemePref();
  const resolved = pref ? (pref === "system" ? (typeof window !== "undefined" ? resolve("system") : "dark") : pref) : null;
  const next = resolved === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => setThemePref(next)}
      aria-label={resolved ? `Switch to ${next} theme` : "Toggle theme"}
      title={resolved ? `Switch to ${next} theme` : "Toggle theme"}
      className={cn("grid size-9 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg", className)}
    >
      <Icon name={resolved === "light" ? "moon" : "sun"} className="size-[18px]" />
    </button>
  );
}

export function ThemeChooser() {
  const pref = useThemePref();
  const opts: { id: ThemePref; label: string; icon: "moon" | "sun" | "monitor" }[] = [
    { id: "dark", label: "Dark", icon: "moon" },
    { id: "light", label: "Light", icon: "sun" },
    { id: "system", label: "Match system", icon: "monitor" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={pref === o.id}
          onClick={() => setThemePref(o.id)}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border px-3 py-4 text-sm transition-colors",
            pref === o.id ? "border-fg bg-surface-2 text-fg" : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
          )}
        >
          <Icon name={o.icon} className="size-5" />
          {o.label}
        </button>
      ))}
    </div>
  );
}
