import { Suspense } from "react";
import { PracticeSession } from "@/components/practice/PracticePlayer";
import { PageSkeleton } from "@/components/ui/Primitives";

export const metadata = { title: "Practice session" };

export default function PracticeSessionPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PracticeSession />
    </Suspense>
  );
}
