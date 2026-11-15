"use client";

import { useSearchParams } from "next/navigation";
import { PlusLock } from "./PlusLock";

export function FullPaperLimit() {
  const p = useSearchParams();
  const limit = Number(p.get("limit") ?? 2);
  const used = Number(p.get("used") ?? limit);
  const resets = p.get("resets") ?? "";
  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <PlusLock used={used} limit={limit} resetsOn={/^\d{4}-\d{2}-\d{2}$/.test(resets) ? resets : new Date().toISOString().slice(0, 10)} />
    </div>
  );
}
