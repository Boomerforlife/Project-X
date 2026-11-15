import type { PublicContentBlock } from "@projectx/contracts";
import type { Asset } from "@/contracts";

/**
 * Lossy RichText serialization of API content blocks, used for excerpts,
 * metadata and as a fallback. Paragraphs are joined by a blank line, display
 * math becomes `$$...$$`, list items one per line, table rows tab-separated,
 * images dropped.
 */
export function blocksToRichText(blocks: readonly PublicContentBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "paragraph":
        parts.push(b.text);
        break;
      case "math":
        parts.push(`$$${b.latex}$$`);
        break;
      case "list":
        parts.push(b.items.map((it, i) => (b.ordered ? `${i + 1}. ${it}` : `- ${it}`)).join("\n"));
        break;
      case "table": {
        const rows = [...(b.header ? [b.header] : []), ...b.rows];
        parts.push(rows.map((r) => r.join("\t")).join("\n"));
        break;
      }
      case "image":
        break;
    }
  }
  return parts.filter((p) => p.length > 0).join("\n\n");
}

/** Images with known dimensions (the `Asset` schema needs positive ints). */
export function imageAssets(blocks: readonly PublicContentBlock[]): Asset[] {
  const out: Asset[] = [];
  for (const b of blocks) {
    if (b.type !== "image") continue;
    if (!b.width || !b.height || b.width <= 0 || b.height <= 0) continue;
    out.push({ id: b.asset_id, url: b.url, alt: b.alt || "Figure", width: b.width, height: b.height });
  }
  return out;
}

/**
 * Backend excerpts are cut at 200 chars and can end inside `$...$`. Drop an
 * unterminated math span so KaTeX never sees a dangling delimiter.
 */
export function safeExcerpt(text: string): string {
  const dollars: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "$") dollars.push(i);
  }
  if (dollars.length % 2 === 0) return text;
  const last = dollars[dollars.length - 1]!;
  return `${text.slice(0, last).trimEnd()}…`;
}
