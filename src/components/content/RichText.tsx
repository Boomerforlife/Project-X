import katex from "katex";
import { cn } from "@/lib/cn";

/**
 * Renders the draft RichText format: text with `$…$` inline and `$$…$$`
 * display TeX. Runs on the server, so math is present in the HTML (crawlable,
 * no layout shift, no client JS). KaTeX also emits MathML for screen readers.
 */
type Segment = { kind: "text" | "inline" | "display"; value: string };

export function parseRichText(src: string): Segment[] {
  const out: Segment[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    if (m.index > last) out.push({ kind: "text", value: src.slice(last, m.index) });
    out.push(m[1] !== undefined ? { kind: "display", value: m[1] } : { kind: "inline", value: m[2] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: "text", value: src.slice(last) });
  return out;
}

export function renderTex(tex: string, displayMode: boolean) {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false, // malformed TeX shows in red instead of crashing the page
    output: "htmlAndMathml",
    strict: "ignore",
  });
}

/** `inline` renders display math inline — for compact previews and list rows. */
export function RichText({ value, className, inline = false }: { value: string; className?: string; inline?: boolean }) {
  return (
    <span className={cn("rich-text", className)}>
      {parseRichText(value).map((seg, i) =>
        seg.kind === "text" ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <span
            key={i}
            className={seg.kind === "display" && !inline ? "block" : undefined}
            dangerouslySetInnerHTML={{ __html: renderTex(seg.value, seg.kind === "display" && !inline) }}
          />
        ),
      )}
    </span>
  );
}

const TEX_SYMBOLS: Record<string, string> = {
  mu: "μ", pi: "π", theta: "θ", lambda: "λ", alpha: "α", beta: "β", gamma: "γ", omega: "ω",
  varepsilon: "ε", epsilon: "ε", Delta: "Δ", times: "×", cdot: "·", circ: "°", infty: "∞",
  to: "→", leq: "≤", geq: "≥", neq: "≠", pm: "±", int: "∫", sum: "Σ", lim: "lim",
  sin: "sin", cos: "cos", tan: "tan", log: "log", det: "det",
};

/** Plain-text approximation of TeX for meta descriptions, link text and JSON-LD. */
export function texToPlain(tex: string) {
  let s = tex;
  // \frac{a}{b} / \dfrac / \tfrac → a/b (repeat for shallow nesting)
  for (let i = 0; i < 3; i++) s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2");
  s = s
    // Known symbols first, so "\mu\text{F}" can't merge into "\muF".
    .replace(/\\([a-zA-Z]+)(?![a-zA-Z])/g, (m, name: string) => TEX_SYMBOLS[name] ?? m)
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, "$1")
    .replace(/\\[,;:! ]|\\quad|\\qquad|~/g, " ")
    .replace(/\\[a-zA-Z]+(?:\{[a-z]*\})?/g, "") // remaining layout commands (\left, \begin{…}, …)
    .replace(/[{}^_&\\]/g, "");
  return s;
}

export function richTextToPlain(value: string) {
  return parseRichText(value)
    .map((s) => (s.kind === "text" ? s.value : texToPlain(s.value)))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
}
