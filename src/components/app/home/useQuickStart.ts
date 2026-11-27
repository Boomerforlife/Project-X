"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/ui/Toast";
import { quickPractice } from "@/lib/demo/launch";
import { routes } from "@/lib/routes";
import type { ExamId } from "@/contracts";

/** Starts the existing one-tap 10-question Learning session (same call the old dashboard used) and opens it. */
export function useQuickStart(exam: ExamId) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const start = async () => {
    setStarting(true);
    try {
      const id = await quickPractice(exam);
      if (id) router.push(routes.session(id));
      else {
        setStarting(false);
        toast("You've solved everything there. Open a chapter to include solved questions.", { icon: "info", tone: "warn" });
      }
    } catch {
      setStarting(false);
      toast("Couldn't start the session. Please try again.", { icon: "alert", tone: "warn" });
    }
  };
  return { starting, start };
}
