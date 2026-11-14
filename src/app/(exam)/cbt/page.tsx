import { Suspense } from "react";
import { CbtEntry } from "@/components/cbt/CbtExam";

export const metadata = { title: "Exam (CBT)" };

export default function CbtPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-fg-muted">Loading exam…</p>}>
      <CbtEntry />
    </Suspense>
  );
}
