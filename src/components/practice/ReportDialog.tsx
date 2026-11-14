"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Primitives";

const REASONS = ["The answer key looks wrong", "The question has a typo or missing data", "The solution is unclear or wrong", "A figure or equation doesn't display", "Something else"];

/** Report never reveals the answer, so it stays available in Test mode and CBT. */
export function ReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const close = () => {
    onClose();
    window.setTimeout(() => {
      setSent(false);
      setNote("");
    }, 200);
  };
  return (
    <Dialog open={open} onClose={close} title={sent ? "Thanks — report noted" : "Report this question"}>
      {sent ? (
        <div className="text-sm">
          <p className="text-fg-soft">In the full product this goes to the content team for review. In this demo nothing is sent.</p>
          <Button className="mt-5" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
        >
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm text-fg-muted">What&rsquo;s wrong?</legend>
            {REASONS.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-fg has-[:checked]:bg-surface-2">
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-current" />
                {r}
              </label>
            ))}
          </fieldset>
          <label className="mt-4 block text-sm">
            <span className="text-fg-muted">Details (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1.5 w-full rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm outline-none focus:border-fg" />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit">Send report</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
