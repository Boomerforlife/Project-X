"use client";

import { useEffect, useState } from "react";
import { todaysPlanTask } from "@/lib/home/next-action";
import { getPlan } from "@/lib/plans";
import type { ItemView } from "@/lib/plans";
import { getDemoState } from "@/lib/demo/store";

/**
 * Today's first unfinished study-plan task, loaded in the background (one read, same `getPlan` the Study plan page uses).
 * Never blocks Home: null while loading, when there is no plan, nothing is due, or the request fails.
 */
export function useTodaysPlanTask(enabled: boolean, userKey: string): ItemView | null {
  const [task, setTask] = useState<{ key: string; item: ItemView | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // Let the session burst after sign-in settle first, as the Study plan page does.
    const t = setTimeout(() => {
      getPlan(getDemoState())
        .then((p) => live && setTask({ key: userKey, item: todaysPlanTask(p) }))
        .catch(() => live && setTask({ key: userKey, item: null }));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [enabled, userKey]);
  return enabled && task?.key === userKey ? task.item : null;
}
