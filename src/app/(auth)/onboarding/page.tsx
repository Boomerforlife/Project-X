import { Suspense } from "react";
import { Onboarding } from "@/components/app/Onboarding";
import { PageSkeleton } from "@/components/ui/Primitives";

export const metadata = { title: "Welcome" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Onboarding />
    </Suspense>
  );
}
