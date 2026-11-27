"use client";

import type { ComponentProps } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { useDemo } from "@/lib/demo/store";
import { routes } from "@/lib/routes";
import { Wordmark } from "./Wordmark";

/** "Home" for whoever is looking: the student's Home when signed in, the landing page otherwise (never a login wall). */
export function useHomeHref(): string {
  const s = useDemo();
  return s?.user ? routes.home : routes.landing;
}

export function HomeWordmark() {
  return <Wordmark href={useHomeHref()} />;
}

export function HomeButtonLink(props: Omit<ComponentProps<typeof ButtonLink>, "href">) {
  return <ButtonLink href={useHomeHref()} {...props} />;
}
