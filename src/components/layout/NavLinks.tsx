"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ExamId } from "@/contracts";
import { ThemeToggle } from "@/components/theme/Theme";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { signOut, updateUser, useDemo } from "@/lib/demo/store";
import { EXAM_LIST, EXAMS } from "@/lib/exams";
import { APP_NAV, PRIMARY_NAV, isActive, type NavItem } from "./nav";

export type NavVariant = "site" | "app";
const navFor = (v: NavVariant): readonly NavItem[] => (v === "app" ? APP_NAV : PRIMARY_NAV);

export function DesktopNav({ variant = "site" }: { variant?: NavVariant }) {
  const pathname = usePathname();
  const nav = navFor(variant);
  return (
    <ul className="hidden items-center gap-0.5 lg:flex">
      {nav.map((item) => {
        const active = isActive(pathname, item.match, nav);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("relative rounded-md px-3 py-2 text-sm transition-colors", active ? "text-fg" : "text-fg-muted hover:text-fg")}
            >
              {item.label}
              {active && <span aria-hidden className="absolute inset-x-3 -bottom-[13px] h-0.5 bg-fg" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Closes a popover on outside click / Escape and returns focus to its trigger. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref, btn };
}

export function ExamSwitcher({ compact = false }: { compact?: boolean }) {
  const s = useDemo();
  const { open, setOpen, ref, btn } = usePopover();
  const id = useId();
  if (!s?.user) return null;
  const exam = EXAMS[s.user.exam];
  const choose = (e: ExamId) => {
    updateUser({ exam: e });
    setOpen(false);
  };
  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Target exam: ${exam.name}. Change exam`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-md border border-line px-2.5 text-sm text-fg-soft transition-colors hover:border-line-strong hover:text-fg",
          compact && "h-8",
        )}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-ok" />
        {exam.name}
        <Icon name="chevronDown" className="size-3.5 text-fg-muted" />
      </button>
      {open && (
        <div id={id} role="menu" className="rise absolute right-0 top-11 z-50 w-72 rounded-xl border border-line-strong bg-surface p-1.5 shadow-[var(--shadow-pop)]">
          <p className="px-2.5 pb-1.5 pt-1 text-xs text-fg-muted">Preparing for</p>
          {EXAM_LIST.map((e) => (
            <button
              key={e.id}
              role="menuitemradio"
              aria-checked={e.id === exam.id}
              type="button"
              onClick={() => choose(e.id)}
              className={cn("flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2", e.id === exam.id && "bg-surface-2")}
            >
              <span className={cn("mt-1 grid size-4 shrink-0 place-items-center rounded-full border", e.id === exam.id ? "border-fg" : "border-line-strong")}>
                {e.id === exam.id && <span className="size-2 rounded-full bg-fg" />}
              </span>
              <span>
                <span className="block text-sm font-medium">{e.name}</span>
                <span className="block text-xs text-fg-muted">{e.pattern}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="pixel-corners grid size-8 place-items-center bg-fg font-pixel text-[0.7rem] text-bg">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function AccountMenu() {
  const s = useDemo();
  const router = useRouter();
  const { open, setOpen, ref, btn } = usePopover();
  const id = useId();
  if (!s?.user) return null;
  const links = [
    { href: "/account/", label: "Profile & settings", icon: "settings" as const },
    { href: "/progress/", label: "Progress & achievements", icon: "chart" as const },
    { href: "/leaderboard/", label: "Leaderboard", icon: "trophy" as const },
    { href: "/bookmarks/", label: "Bookmarks", icon: "bookmark" as const },
  ];
  return (
    <div ref={ref} className="relative">
      <button ref={btn} type="button" aria-expanded={open} aria-controls={id} aria-label="Account menu" onClick={() => setOpen((o) => !o)} className="grid size-9 place-items-center rounded-md hover:bg-surface-2">
        <Avatar name={s.user.name} />
      </button>
      {open && (
        <div id={id} role="menu" className="rise absolute right-0 top-11 z-50 w-64 rounded-xl border border-line-strong bg-surface p-1.5 shadow-[var(--shadow-pop)]">
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <p className="text-sm font-medium">{s.user.name}</p>
            <p className="text-xs text-fg-muted">Demo account · {EXAMS[s.user.exam].name}</p>
          </div>
          <div className="py-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-soft hover:bg-surface-2 hover:text-fg">
                <Icon name={l.icon} className="size-4 text-fg-muted" />
                {l.label}
              </Link>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              signOut();
              router.push("/");
            }}
            className="flex w-full items-center gap-2.5 rounded-lg border-t border-line px-2.5 py-2 text-sm text-fg-soft hover:bg-surface-2 hover:text-fg"
          >
            <Icon name="logout" className="size-4 text-fg-muted" />
            Sign out of demo
          </button>
        </div>
      )}
    </div>
  );
}

/** Right side of the header. Renders the signed-out state on the server, then hydrates. */
export function HeaderActions({ variant = "site" }: { variant?: NavVariant }) {
  const s = useDemo();
  const signedIn = Boolean(s?.user);
  return (
    <div className="hidden items-center gap-1.5 lg:flex">
      <ThemeToggle />
      {s === null && variant === "app" ? (
        <span className="skeleton h-8 w-32" />
      ) : signedIn ? (
        <>
          {variant === "site" && (
            <Link href="/dashboard/" className="mr-1 inline-flex h-9 items-center rounded-md px-3 text-sm text-fg-soft hover:bg-surface-2 hover:text-fg">
              Dashboard
            </Link>
          )}
          <ExamSwitcher />
          <AccountMenu />
        </>
      ) : (
        <>
          <Link href="/login/" className="inline-flex h-9 items-center rounded-md px-3 text-sm text-fg-soft hover:bg-surface-2 hover:text-fg">
            Log in
          </Link>
          <Link href="/signup/" className="pixel-corners inline-flex h-9 items-center bg-fg px-3 text-sm font-medium text-bg hover:bg-fg-soft">
            Try the demo
          </Link>
        </>
      )}
    </div>
  );
}

const noopSubscribe = () => () => {};

export function MobileNav({ variant = "site" }: { variant?: NavVariant }) {
  const pathname = usePathname();
  const router = useRouter();
  const s = useDemo();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The panel is portalled because the header's backdrop-filter would otherwise trap position:fixed inside it.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const nav = navFor(s?.user && variant === "site" ? "site" : variant);

  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1 lg:hidden">
      <ThemeToggle />
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="-mr-2 grid size-11 place-items-center rounded-md text-fg hover:bg-surface-2"
      >
        <svg viewBox="0 0 20 20" className="size-5" aria-hidden shapeRendering="crispEdges">
          {open ? (
            <path d="M4 4h2v2H4zM6 6h2v2H6zM8 8h4v4H8zM12 6h2v2h-2zM14 4h2v2h-2zM6 12h2v2H6zM4 14h2v2H4zM12 12h2v2h-2zM14 14h2v2h-2z" fill="currentColor" />
          ) : (
            <path d="M3 5h14v2H3zM3 9h14v2H3zM3 13h14v2H3z" fill="currentColor" />
          )}
        </svg>
      </button>
      {mounted &&
        createPortal(
          <div id={panelId} hidden={!open} className="fixed inset-x-0 bottom-0 top-14 z-40 overflow-y-auto border-t border-line bg-bg">
            <nav aria-label="Primary" className="mx-auto max-w-6xl px-4 py-4">
              {s?.user && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={s.user.name} />
                    <div>
                      <p className="text-sm font-medium">{s.user.name}</p>
                      <p className="text-xs text-fg-muted">Demo account</p>
                    </div>
                  </div>
                  <ExamSwitcher compact />
                </div>
              )}
              <ul className="flex flex-col">
                {(s?.user && variant === "site" ? [...APP_NAV.slice(0, 2), ...nav] : nav).map((item) => {
                  const active = isActive(pathname, item.match, nav);
                  return (
                    <li key={item.href + item.label}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn("flex h-14 items-center justify-between border-b border-line font-display text-xl", active ? "text-fg" : "text-fg-soft")}
                      >
                        {item.label}
                        <span aria-hidden className="font-pixel text-xs text-fg-subtle">{active ? "●" : "→"}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {s?.user ? (
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Link href="/account/" className="flex h-12 items-center justify-center rounded-md border border-line-strong">
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      router.push("/");
                    }}
                    className="flex h-12 items-center justify-center rounded-md border border-line-strong"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Link href="/login/" className="flex h-12 items-center justify-center rounded-md border border-line-strong">
                    Log in
                  </Link>
                  <Link href="/signup/" className="flex h-12 items-center justify-center rounded-md bg-fg font-medium text-bg">
                    Try the demo
                  </Link>
                </div>
              )}
            </nav>
          </div>,
          document.body,
        )}
    </div>
  );
}
