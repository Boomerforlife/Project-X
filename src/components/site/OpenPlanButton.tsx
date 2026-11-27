"use client";

import { ButtonLink } from "@/components/ui/Button";
import { useDemo } from "@/lib/demo/store";
import { routes } from "@/lib/routes";

/** Study-plans CTA: "Open your study plan" for signed-in students, the diagnostic (needs a free account) otherwise. */
export function OpenPlanButton({ className }: { className?: string }) {
  const s = useDemo();
  return s?.user ? (
    <ButtonLink href={routes.studyPlan} size="lg" pixel className={className}>
      Open your study plan
    </ButtonLink>
  ) : (
    <ButtonLink href={routes.signup(routes.studyPlan)} size="lg" pixel className={className}>
      Take the diagnostic · free account
    </ButtonLink>
  );
}
