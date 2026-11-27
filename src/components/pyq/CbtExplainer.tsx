import { Icon } from "@/components/ui/Icon";
import { Card, Eyebrow } from "@/components/ui/Primitives";
import { cn } from "@/lib/cn";

/** What the exam-style CBT gives you, with a miniature of its palette (moved from the old /tests/ hub). Server-safe. */
export function CbtExplainer({ className }: { className?: string }) {
  return (
    <Card className={cn("grid gap-6 overflow-hidden p-0 md:grid-cols-[1fr_1.1fr]", className)}>
      <div className="p-6">
        <Eyebrow>Exam-style CBT</Eyebrow>
        <h2 className="mt-2 text-xl font-semibold">Practise the interface, not just the questions.</h2>
        <ul className="mt-4 space-y-2 text-sm text-fg-soft">
          {["Countdown timer with auto-submit", "Section tabs and a status palette", "Mark for review, clear response, save & next", "No hints or answers until you submit", "Every retry is saved as a new attempt"].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Icon name="check" className="mt-0.5 size-4 shrink-0 text-ok" />
              {t}
            </li>
          ))}
        </ul>
      </div>
      {/* Miniature of the real CBT palette, built from the same visual language. */}
      <div aria-hidden className="relative hidden border-l border-line bg-bg p-6 md:block">
        <div className="rounded-md border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[0.65rem]">
            <span className="font-semibold">JEE Main · Full paper</span>
            <span className="rounded border border-line-strong px-1.5 py-0.5 font-mono">02:41:07</span>
          </div>
          <div className="flex gap-3 border-b border-line px-3 py-1.5 text-[0.65rem] text-fg-muted">
            <span className="text-fg">Physics 12/25</span>
            <span>Chemistry 8/25</span>
            <span>Mathematics 3/25</span>
          </div>
          <div className="grid grid-cols-[1fr_7.5rem]">
            <div className="space-y-1.5 p-3">
              <div className="h-2 w-11/12 rounded bg-surface-3" />
              <div className="h-2 w-9/12 rounded bg-surface-3" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={cn("mt-2 h-5 rounded border", i === 1 ? "border-fg bg-surface-2" : "border-line")} />
              ))}
            </div>
            <div className="grid grid-cols-5 content-start gap-1 border-l border-line p-2">
              {Array.from({ length: 25 }, (_, i) => (
                <span key={i} className={cn("h-4 rounded-[2px]", i < 9 ? "bg-ok" : i === 9 || i === 14 ? "rounded-full bg-biology" : i < 13 ? "bg-bad" : "bg-surface-3")} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
