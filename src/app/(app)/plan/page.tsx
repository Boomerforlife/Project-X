import { Suspense } from "react";
import { StudyPlanPage } from "@/components/app/StudyPlan";
import { PageSkeleton } from "@/components/ui/Primitives";

export const metadata = { title: "Your plan" };

export default function PlanPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudyPlanPage />
    </Suspense>
  );
}
