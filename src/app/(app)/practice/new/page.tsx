import { Suspense } from "react";
import { LauncherPage } from "@/components/app/PracticeHub";
import { PageSkeleton } from "@/components/ui/Primitives";

export const metadata = { title: "Start practice" };

export default function NewPracticePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LauncherPage />
    </Suspense>
  );
}
