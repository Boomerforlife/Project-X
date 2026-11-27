"use client";

import Link from "next/link";
import { useDemo } from "@/lib/demo/store";
import { routes } from "@/lib/routes";

/** "Log in" for visitors, "Home" for signed-in students (the footer is server-rendered; this one link is personal). */
export function FooterAccountLink() {
  const s = useDemo();
  return s?.user ? (
    <Link href={routes.home} className="text-fg-muted hover:text-fg">
      Home
    </Link>
  ) : (
    <Link href={routes.login()} className="text-fg-muted hover:text-fg">
      Log in
    </Link>
  );
}
