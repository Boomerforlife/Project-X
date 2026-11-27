"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ExamId, SubjectId } from "@/contracts";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { startList, useDemo } from "@/lib/demo/store";
import { routes } from "@/lib/routes";

/**
 * Signed-in students on a public question page can carry on in the practice player — palette, bookmarks, review list,
 * calculator, scratchpad — walking the chapter's list from this question (Previous/Next work there too). Renders nothing
 * for visitors, who keep practising right on the public pages.
 */
export function ContinueInPlayer({ exam, subject, chapter, chapterName, ids, startId }: { exam: ExamId; subject: SubjectId; chapter: string; chapterName: string; ids: string[]; startId: string }) {
  const s = useDemo();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!s?.user || ids.length === 0) return null;
  const go = async () => {
    setBusy(true);
    try {
      const id = await startList({ exam, title: chapterName, items: ids.map((questionId) => ({ questionId })), startIndex: Math.max(0, ids.indexOf(startId)), scope: { source: "chapter", subject, chapter } });
      router.push(`${routes.session(id)}&from=${encodeURIComponent(window.location.pathname)}`);
    } catch {
      setBusy(false);
      toast("Couldn't open the practice view. Please try again.", { icon: "alert", tone: "warn" });
    }
  };
  return (
    <Button variant="secondary" size="sm" disabled={busy} onClick={() => void go()} className="max-sm:min-h-11">
      <Icon name="play" className="size-3.5" /> {busy ? "Opening…" : `Practise ${chapterName} from here`}
    </Button>
  );
}
