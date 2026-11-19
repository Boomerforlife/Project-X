import type { Cell, CompareGroup } from "@/lib/billing/compare";
import { cn } from "@/lib/cn";
import { PlusBadge } from "./PlusBadge";

/**
 * Side-by-side Free vs Plus table (server component). Rows come from `compareGroups`, so it lists only features the API
 * enforces today. States are carried by an icon AND text (never colour alone): Included, a limit, or Not included.
 */
export function PlanCompare({ groups }: { groups: CompareGroup[] }) {
  return (
    <section aria-labelledby="compare-h" className="mt-16">
      <h2 id="compare-h" className="font-display text-2xl font-semibold">
        Compare Free and Plus
      </h2>
      <p className="mt-1 text-sm text-fg-muted">Only what works today. Limits come from the server and apply the same way in the app.</p>
      <div className="mt-6 overflow-hidden rounded-xl border border-line">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Features included in Free and in Tabby Plus</caption>
          <colgroup>
            <col />
            <col className="w-[28%] sm:w-[26%]" />
            <col className="w-[30%] bg-plus/[0.04] sm:w-[26%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-line bg-surface">
              <th scope="col" className="px-3 py-3 font-medium text-fg-muted sm:px-5">
                Feature
              </th>
              <th scope="col" className="px-3 py-3 font-display font-semibold sm:px-5">
                Free
              </th>
              <th scope="col" className="px-3 py-3 sm:px-5">
                <span className="inline-flex items-center gap-2 font-display font-semibold">
                  Plus <PlusBadge className="hidden sm:inline-flex" />
                </span>
              </th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title}>
              <tr className="border-b border-line">
                <th scope="rowgroup" colSpan={3} className="bg-surface-2/60 px-3 pb-2 pt-4 text-[11px] font-medium uppercase tracking-[0.15em] text-fg-muted sm:px-5">
                  {g.title}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.feature} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-3 py-3 align-top font-normal sm:px-5">
                    <span className="block font-medium text-fg">{r.feature}</span>
                    {r.detail ? <span className="mt-0.5 hidden text-xs text-fg-muted sm:block">{r.detail}</span> : null}
                  </th>
                  <td className="px-3 py-3 align-top sm:px-5">
                    <CellView c={r.free} />
                  </td>
                  <td className="px-3 py-3 align-top sm:px-5">
                    <CellView c={r.plus} plus />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

function CellView({ c, plus = false }: { c: Cell; plus?: boolean }) {
  if (c.kind === "no") {
    return (
      <span className="inline-flex items-center gap-1.5 text-fg-subtle">
        <span aria-hidden>—</span>
        <span className="sr-only">{c.text}</span>
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-start gap-1.5", c.kind === "limited" ? "text-fg-muted" : plus ? "text-fg" : "text-fg-soft")}>
      {c.kind === "yes" ? (
        <svg aria-hidden viewBox="0 0 10 10" className={cn("mt-1 size-2.5 shrink-0", plus ? "text-plus" : "text-ok")} shapeRendering="crispEdges" fill="currentColor">
          <path d="M8 1h2v2H9v1H8v1H7v1H6v1H5v1H4v1H3V8H2V7H1V6H0V4h2v1h1v1h1V5h1V4h1V3h1V2h1z" />
        </svg>
      ) : (
        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-fg-muted" />
      )}
      <span>
        {c.kind === "limited" ? <span className="sr-only">Limited: </span> : null}
        {c.text}
      </span>
    </span>
  );
}
