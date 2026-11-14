import { Suspense } from "react";
import { ResultsPage } from "@/components/results/ResultsView";
import { PageSkeleton } from "@/components/ui/Primitives";

export const metadata = { title: "Results" };

export default function Results() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ResultsPage />
    </Suspense>
  );
}
