import { Suspense } from "react";
import { PracticeHubPage } from "@/components/app/PracticeHub";
import { PageSkeleton } from "@/components/ui/Primitives";

export const metadata = { title: "Practice" };

export default function PracticePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PracticeHubPage />
    </Suspense>
  );
}
