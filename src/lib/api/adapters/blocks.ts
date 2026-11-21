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
 * Figures still to draw below the stem. In API mode every image is already an
 * image block, which `Blocks` renders inline, so drawing `assets` as well showed
 * each image twice. Fixtures have no blocks and keep all their assets.
 */
export function figuresNotInBlocks<A extends { id: string }>(assets: readonly A[], blocks: readonly PublicContentBlock[] | undefined): A[] {
  if (!blocks?.length) return [...assets];
  const inline = new Set(blocks.flatMap((b) => (b.type === "image" ? [b.asset_id] : [])));
  return assets.filter((a) => !inline.has(a.id));
}

/**
 * NTA's scanned JEE Main papers print a per-question header ("Orientation : Vertical Correct Marks : 4 Wrong Marks : 1",
 * or "Orientation Vertical • ●") that OCR reads into the stem text. It is paper chrome, not the question, so it is
 * dropped from the start of any text we derive titles, headings, descriptions and excerpts from. Only a LEADING run is
 * removed: the same words later in a stem are left alone.
 */
const PAPER_HEADER_TOKEN =
  /^(?:orientation\s*:?\s*(?:vertical|horizontal)\b|correct\s+marks\s*:?\s*[-+]?\d+(?:\.\d+)?|wrong\s+marks\s*:?\s*[-+]?\d+(?:\.\d+)?|[•●▪■◦,;:])\s*/i;

export function stripPaperHeader(text: string): string {
  let out = text.trimStart();
  for (let m = PAPER_HEADER_TOKEN.exec(out); m && m[0].length > 0; m = PAPER_HEADER_TOKEN.exec(out)) {
    out = out.slice(m[0].length);
  }
  return out;
}

/**
 * Backend excerpts are cut at 200 chars and can end inside `$...$`. Drop an
 * unterminated math span so KaTeX never sees a dangling delimiter. Also drops a
 * leading scanned-paper header (see `stripPaperHeader`).
 */
export function safeExcerpt(raw: string): string {
  const text = stripPaperHeader(raw);
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
