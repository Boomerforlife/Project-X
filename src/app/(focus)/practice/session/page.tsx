import { Suspense } from "react";
import { PracticeSession } from "@/components/practice/PracticePlayer";
import { LoadingScreen, SESSION_MESSAGES } from "@/components/states/Loading";

export const metadata = { title: "Practice session" };

export default function PracticeSessionPage() {
  return (
    <Suspense fallback={<LoadingScreen messages={SESSION_MESSAGES} label="Loading your practice session" />}>
      <PracticeSession />
    </Suspense>
  );
}
