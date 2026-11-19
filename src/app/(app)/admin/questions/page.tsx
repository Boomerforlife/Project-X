import { Suspense } from "react";
import { ClassifyQuestions } from "@/components/admin/ClassifyQuestions";
import { PageSkeleton } from "@/components/ui/Primitives";

// Private admin tool: the (app) layout already sets noindex; access is enforced by the API (reviewer/admin roles).
export const metadata = { title: "Question classification" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClassifyQuestions />
    </Suspense>
  );
}
