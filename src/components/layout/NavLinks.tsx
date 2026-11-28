"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ExamId } from "@/contracts";
import { TierBadge } from "@/components/billing/TierBadge";
import { ThemeToggle } from "@/components/theme/Theme";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { COPY } from "@/lib/copy";
import { signOut, updateUser, useDemo } from "@/lib/demo/store";
import { EXAMS } from "@/lib/exams";
import { LEADERBOARD_ENABLED } from "@/lib/demo/progress";
import { routes } from "@/lib/routes";
import { availableExams } from "@/lib/session/exams";
import { DATA_SOURCE } from "@/lib/site";
import { isActive, navItems, type AuthView, type NavItem } from "./nav";

const SIGNUP_LABEL = DATA_SOURCE === "api" ? "Sign up" : "Try the demo";
const SIGN_OUT_LABEL = DATA_SOURCE === "mock" ? "Sign out of demo" : "Sign out";

/** Auth state as the header sees it: "loading" until the session is known (render only what is true for everyone). */
export function useAuthView() {
  const s = useDemo();
  const view: AuthView = s === null ? "loading" : s.user ? "signedIn" : "signedOut";
  const track = s?.user ? EXAMS[s.user.exam].track : "jee";
  return { s, view, track } as const;
}

/** Where a sign-in should come back to: the current page, except the landing and auth pages. */
function useReturnPath(): string | null {
  const pathname = usePathname() ?? "/";
  if (pathname === "/" || /^\/(login|signup|onboarding)\//.test(pathname)) return null;
  return pathname;
}

export function DesktopNav({ hidden = [] }: { hidden?: readonly string[] }) {
  const pathname = usePathname() ?? "/";
  const { view, track } = useAuthView();
  const nav = navItems(view, { track, hidden });
  return (
    <ul className="hidden items-center gap-0.5 lg:flex">
      {nav.map((item) => {
        const active = isActive(pathname, item.match, nav);
        return (
          <li key={item.id}>
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
    void updateUser({ exam: e });
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
          compact && "h-11",
        )}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-ok" />
        {exam.name}
        <Icon name="chevronDown" className="size-3.5 text-fg-muted" />
      </button>
      {open && (
        <div id={id} role="menu" className="rise absolute right-0 top-11 z-50 w-72 rounded-xl border border-line-strong bg-surface p-1.5 shadow-[var(--shadow-pop)]">
          <p className="px-2.5 pb-1.5 pt-1 text-xs text-fg-muted">Preparing for</p>
          {availableExams().map((e) => (
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

/** Account links shared by the desktop avatar menu and the phone menu. */
const ACCOUNT_LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: routes.studyPlan, label: COPY.studyPlan, icon: "list" },
  { href: routes.account, label: COPY.account, icon: "settings" },
  ...(LEADERBOARD_ENABLED ? [{ href: routes.leaderboard, label: "Leaderboard", icon: "trophy" as const }] : []),
];

function AccountMenu() {
  const s = useDemo();
  const router = useRouter();
  const { open, setOpen, ref, btn } = usePopover();
  const id = useId();
  if (!s?.user) return null;
  return (
    <div ref={ref} className="relative">
      <button ref={btn} type="button" aria-expanded={open} aria-controls={id} aria-label="Account menu" onClick={() => setOpen((o) => !o)} className="grid size-9 place-items-center rounded-md hover:bg-surface-2">
        <Avatar name={s.user.name} />
      </button>
      {open && (
        <div id={id} role="menu" className="rise absolute right-0 top-11 z-50 w-64 rounded-xl border border-line-strong bg-surface p-1.5 shadow-[var(--shadow-pop)]">
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            <p className="text-sm font-medium">{s.user.name}</p>
            <p className="text-xs text-fg-muted">
              {DATA_SOURCE === "mock" ? "Demo account · " : ""}
              {EXAMS[s.user.exam].name}
            </p>
          </div>
          <div className="py-1">
            {ACCOUNT_LINKS.map((l) => (
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
            {SIGN_OUT_LABEL}
          </button>
        </div>
      )}
    </div>
  );
}

/** Right side of the desktop header. A neutral placeholder while the session loads, so nothing flashes. */
export function HeaderActions() {
  const { view } = useAuthView();
  const back = useReturnPath();
  return (
    <div className="hidden items-center gap-1.5 lg:flex">
      <ThemeToggle />
      {view === "loading" ? (
        <span aria-hidden className="skeleton h-8 w-32" />
      ) : view === "signedIn" ? (
        <>
          <TierBadge className="mr-1" />
          <ExamSwitcher />
          <AccountMenu />
        </>
      ) : (
        <>
          <Link href={routes.login(back)} className="inline-flex h-9 items-center rounded-md px-3 text-sm text-fg-soft hover:bg-surface-2 hover:text-fg">
            Log in
          </Link>
          <Link href={routes.signup(back)} className="pixel-corners inline-flex h-9 items-center bg-fg px-3 text-sm font-medium text-bg hover:bg-fg-soft">
            {SIGNUP_LABEL}
          </Link>
        </>
      )}
    </div>
  );
}

const noopSubscribe = () => () => {};

/**
 * Phone and tablet header controls. Visitors: a visible Sign up button and the menu. Signed-in students: the menu holds
 * the account items (the five main destinations are in the bottom tab bar).
 */
export function MobileNav({ hidden = [] }: { hidden?: readonly string[] }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { s, view, track } = useAuthView();
  const back = useReturnPath();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The panel is portalled because the header's backdrop-filter would otherwise trap position:fixed inside it.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const nav = navItems(view, { track, hidden });
  // Signed in, the main destinations live in the tab bar; the menu lists only what is not there.
  const menuNav = view === "signedIn" ? [] : nav;

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
    <div className="flex items-center gap-1.5 lg:hidden">
      {view === "signedOut" && (
        <Link href={routes.signup(back)} className="pixel-corners inline-flex h-9 items-center bg-fg px-3 text-sm font-medium text-bg hover:bg-fg-soft">
          {SIGNUP_LABEL}
        </Link>
      )}
      {view === "signedIn" && <TierBadge />}
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
            <nav aria-label="Menu" className="mx-auto max-w-6xl px-4 py-4">
              {s?.user && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={s.user.name} />
                    <div>
                      <p className="text-sm font-medium">{s.user.name}</p>
                      {DATA_SOURCE === "mock" ? <p className="text-xs text-fg-muted">Demo account</p> : <TierBadge className="mt-1" />}
                    </div>
                  </div>
                  <ExamSwitcher compact />
                </div>
              )}
              <ul className="flex flex-col">
                {menuNav.map((item) => (
                  <MenuRow key={item.id} href={item.href} label={item.label} active={isActive(pathname, item.match, nav)} />
                ))}
                {view === "signedIn" && ACCOUNT_LINKS.map((l) => <MenuRow key={l.href} href={l.href} label={l.label} active={pathname.startsWith(l.href)} />)}
                <MenuRow href="/resources/" label="Resources" active={pathname.startsWith("/resources/")} subtle />
              </ul>
              <div className="mt-4 flex min-h-12 items-center justify-between rounded-xl border border-line px-3">
                <span className="text-sm text-fg-soft">Theme</span>
                <ThemeToggle className="size-11" />
              </div>
              {s?.user ? (
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    router.push("/");
                  }}
                  className="mt-4 flex h-12 w-full items-center justify-center rounded-md border border-line-strong"
                >
                  {SIGN_OUT_LABEL}
                </button>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Link href={routes.login(back)} className="flex h-12 items-center justify-center rounded-md border border-line-strong">
                    Log in
                  </Link>
                  <Link href={routes.signup(back)} className="flex h-12 items-center justify-center rounded-md bg-fg font-medium text-bg">
                    {SIGNUP_LABEL}
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

function MenuRow({ href, label, active, subtle = false }: { href: string; label: string; active: boolean; subtle?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn("flex h-14 items-center justify-between border-b border-line", subtle ? "text-base text-fg-muted" : "font-display text-xl", active ? "text-fg" : !subtle && "text-fg-soft")}
      >
        {label}
        {active && <span aria-hidden className="font-pixel text-xs text-fg-subtle">●</span>}
      </Link>
    </li>
  );
}

/**
 * Signed-in phones and tablets: the five main destinations as a bottom tab bar (owner decision 2026-11-28, replacing the
 * hamburger for these items). Never rendered in the practice player or the CBT, which have no site header.
 */
export function BottomTabs() {
  const pathname = usePathname() ?? "/";
  const { view, track } = useAuthView();
  const signedIn = view === "signedIn";
  useEffect(() => {
    if (!signedIn) return;
    document.documentElement.dataset.tabbar = "1";
    return () => {
      delete document.documentElement.dataset.tabbar;
    };
  }, [signedIn]);
  if (!signedIn) return null;
  const nav: NavItem[] = navItems("signedIn", { track });
  return (
    <nav data-chrome aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md supports-[backdrop-filter]:bg-bg/85 lg:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {nav.map((item) => {
          const active = isActive(pathname, item.match, nav);
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] transition-colors", active ? "text-fg" : "text-fg-muted hover:text-fg")}
              >
                {active && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 bg-fg" />}
                <Icon name={item.icon} className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
