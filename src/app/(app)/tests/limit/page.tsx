import { Suspense } from "react";
import { FullPaperLimit } from "@/components/billing/FullPaperLimit";
import { PageSkeleton } from "@/components/ui/Primitives";

export const metadata = { title: "Full paper limit" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FullPaperLimit />
    </Suspense>
  );
}
