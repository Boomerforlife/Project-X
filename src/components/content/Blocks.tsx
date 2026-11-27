import type { ReactNode } from "react";
import type { PublicContentBlock } from "@/contracts";
import { cn } from "@/lib/cn";
import { RichText, parseRichText, renderTex } from "./RichText";
import { ZoomImage } from "./ZoomImage";

/**
 * Renders structured API content blocks (API mode). Prefers `blocks`; when
 * they are absent (fixtures) it falls back to the RichText string, so callers
 * can always pass both. Runs on the server: KaTeX output is in the HTML.
 */

/** Inline text: `$…$` math plus markdown-lite `**bold**` and `*italic*`. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((seg, i) => {
        if (seg.kind !== "text") {
          // Inline context: display math inside a paragraph is rendered inline.
          return <span key={i} dangerouslySetInnerHTML={{ __html: renderTex(seg.value, false) }} />;
        }
        const parts: ReactNode[] = [];
        const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
        let last = 0;
        for (const m of seg.value.matchAll(re)) {
          if (m.index > last) parts.push(seg.value.slice(last, m.index));
          parts.push(m[1] !== undefined ? <strong key={m.index}>{m[1]}</strong> : <em key={m.index}>{m[2]}</em>);
          last = m.index + m[0].length;
        }
        if (last < seg.value.length) parts.push(seg.value.slice(last));
        return <span key={i}>{parts}</span>;
      })}
    </>
  );
}

function Block({ block, zoom }: { block: PublicContentBlock; zoom: boolean }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="whitespace-pre-line">
          <Inline text={block.text} />
        </p>
      );
    case "math":
      return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: renderTex(block.latex, true) }} />;
    case "image":
      return (
        <figure className="max-w-full">
          {zoom ? (
            <ZoomImage src={block.url} alt={block.alt} width={block.width ?? undefined} height={block.height ?? undefined} />
          ) : (
            // Inside an answer option (itself a button): no nested zoom control.
            // eslint-disable-next-line @next/next/no-img-element -- remote public asset URL; dimensions are supplied by the API when known
            <img src={block.url} alt={block.alt} width={block.width ?? undefined} height={block.height ?? undefined} loading="lazy" decoding="async" className="q-img h-auto max-w-full rounded-md border border-line bg-white/5" />
          )}
          {block.caption && (
            <figcaption className="mt-1 text-xs text-fg-muted">
              <Inline text={block.caption} />
            </figcaption>
          )}
        </figure>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            {block.header && (
              <thead>
                <tr>
                  {block.header.map((h, i) => (
                    <th key={i} scope="col" className="border border-line bg-surface-2 px-3 py-1.5 text-left font-medium">
                      <Inline text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-line px-3 py-1.5 align-top">
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={cn("space-y-1 pl-6", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} />
            </li>
          ))}
        </Tag>
      );
    }
  }
}

/** `zoom={false}` inside interactive containers (answer options are buttons): figures then render without the zoom control. */
export function Blocks({ blocks, fallback, className, zoom = true }: { blocks?: PublicContentBlock[]; fallback: string; className?: string; zoom?: boolean }) {
  if (!blocks || blocks.length === 0) return <RichText value={fallback} className={className} />;
  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} zoom={zoom} />
      ))}
    </div>
  );
}
