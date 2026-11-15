import { Suspense } from "react";
import { PapersHub } from "@/components/app/Papers";
import { PageSkeleton } from "@/components/ui/Primitives";

export const metadata = { title: "Papers & mock tests" };

export default function TestsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PapersHub />
    </Suspense>
  );
}
