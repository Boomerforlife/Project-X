"use client";

import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/* ---------------- Calculator (no eval: a tiny recursive-descent parser) ---------------- */

export function evaluateExpression(src: string, degrees = true): number {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/π/g, "(pi)").replace(/\s+/g, "");
  let i = 0;
  const peek = () => s[i];
  const eat = (c: string) => {
    if (s[i] === c) {
      i++;
      return true;
    }
    return false;
  };
  const toRad = (x: number) => (degrees ? (x * Math.PI) / 180 : x);
  const fns: Record<string, (x: number) => number> = {
    sin: (x) => Math.sin(toRad(x)),
    cos: (x) => Math.cos(toRad(x)),
    tan: (x) => Math.tan(toRad(x)),
    log: Math.log10,
    ln: Math.log,
    sqrt: Math.sqrt,
  };
  function expr(): number {
    let v = term();
    for (;;) {
      if (eat("+")) v += term();
      else if (eat("-")) v -= term();
      else return v;
    }
  }
  function term(): number {
    let v = power();
    for (;;) {
      if (eat("*")) v *= power();
      else if (eat("/")) v /= power();
      else return v;
    }
  }
  function power(): number {
    const b = unary();
    if (eat("^")) return Math.pow(b, power());
    return b;
  }
  function unary(): number {
    if (eat("-")) return -unary();
    if (eat("+")) return unary();
    return atom();
  }
  function atom(): number {
    if (eat("(")) {
      const v = expr();
      if (!eat(")")) throw new Error("Missing )");
      return v;
    }
    const name = /^[a-z]+/.exec(s.slice(i))?.[0];
    if (name) {
      i += name.length;
      if (name === "pi") return Math.PI;
      if (name === "e") return Math.E;
      const f = fns[name];
      if (!f) throw new Error(`Unknown ${name}`);
      if (!eat("(")) throw new Error("Expected (");
      const v = expr();
      if (!eat(")")) throw new Error("Missing )");
      return f(v);
    }
    const num = /^\d*\.?\d+(e[+-]?\d+)?/.exec(s.slice(i))?.[0];
    if (!num) throw new Error(`Unexpected ${peek() ?? "end"}`);
    i += num.length;
    return Number(num);
  }
  const v = expr();
  if (i < s.length) throw new Error(`Unexpected ${s[i]}`);
  return v;
}

const KEYS = [
  ["sin(", "cos(", "tan(", "^", "C"],
  ["log(", "ln(", "sqrt(", "(", ")"],
  ["7", "8", "9", "÷", "⌫"],
  ["4", "5", "6", "×", "π"],
  ["1", "2", "3", "-", "e"],
  ["0", ".", "=", "+", "Ans"],
];

export function Calculator({ onClose }: { onClose: () => void }) {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string>("0");
  const [ans, setAns] = useState("0");
  const [deg, setDeg] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = () => {
    try {
      const v = evaluateExpression(expr || "0", deg);
      const out = Number.isFinite(v) ? String(Number(v.toPrecision(12))) : "Error";
      setResult(out);
      if (out !== "Error") setAns(out);
    } catch {
      setResult("Error");
    }
  };
  const press = (k: string) => {
    if (k === "=") return run();
    if (k === "C") {
      setExpr("");
      setResult("0");
      return;
    }
    if (k === "⌫") return setExpr((e) => e.slice(0, -1));
    if (k === "Ans") return setExpr((e) => e + ans);
    setExpr((e) => e + k);
    inputRef.current?.focus();
  };

  return (
    <ToolPanel title="Calculator" onClose={onClose} className="w-[19rem]">
      <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
        <span>Scientific</span>
        <button type="button" onClick={() => setDeg((d) => !d)} className="rounded border border-line px-1.5 py-0.5 hover:text-fg" aria-label={`Angle mode: ${deg ? "degrees" : "radians"}. Switch`}>
          {deg ? "DEG" : "RAD"}
        </button>
      </div>
      <input
        ref={inputRef}
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            run();
          }
        }}
        aria-label="Expression"
        className="h-10 w-full rounded-md border border-line-strong bg-bg px-3 text-right font-mono text-sm outline-none focus:border-fg"
        placeholder="0"
      />
      <output aria-live="polite" className="block truncate px-1 py-2 text-right font-mono text-xl tabular-nums">
        {result}
      </output>
      <div className="grid grid-cols-5 gap-1">
        {KEYS.flat().map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={cn(
              "h-9 rounded-md text-sm transition-colors max-sm:h-11",
              k === "=" ? "bg-fg text-bg hover:bg-fg-soft" : /^[\d.]$/.test(k) ? "bg-surface-3 hover:bg-line-strong" : "bg-surface-2 text-fg-soft hover:bg-surface-3",
            )}
          >
            {k.replace("(", "")}
          </button>
        ))}
      </div>
    </ToolPanel>
  );
}

/* ---------------- Scratchpad (pointer drawing, per question) ---------------- */

const pads = new Map<string, string>();

export function Scratchpad({ padKey, onClose }: { padKey: string; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, c.width, c.height);
    const saved = pads.get(padKey);
    if (saved) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.clientWidth, c.clientHeight);
      img.src = saved;
    }
    const el = c;
    return () => {
      pads.set(padKey, el.toDataURL());
    };
  }, [padKey]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const ink = () => getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#fff";

  return (
    <ToolPanel title="Scratchpad" onClose={onClose} className="w-[min(32rem,calc(100vw-2rem))]">
      <div className="mb-2 flex items-center gap-1">
        {(["pen", "eraser"] as const).map((t) => (
          <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm max-sm:h-11", tool === t ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}>
            <Icon name={t === "pen" ? "pencil" : "eraser"} className="size-4" /> {t === "pen" ? "Pen" : "Eraser"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const c = ref.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            pads.delete(padKey);
          }}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-fg-muted hover:text-fg max-sm:h-11"
        >
          <Icon name="trash" className="size-4" /> Clear
        </button>
      </div>
      <canvas
        ref={ref}
        aria-label="Scratchpad drawing area. Your rough work for this question is kept until you leave the session."
        className="h-64 w-full touch-none rounded-md max-sm:h-[38vh] border border-line bg-bg [background-image:radial-gradient(var(--dot)_1px,transparent_1px)] [background-size:16px_16px]"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = ref.current!.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
          ctx.strokeStyle = ink();
          ctx.lineWidth = tool === "eraser" ? 18 : 2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          pads.set(padKey, ref.current!.toDataURL());
        }}
      />
      <p className="mt-2 text-xs text-fg-muted">Rough work stays on this device and is not part of your answer.</p>
    </ToolPanel>
  );
}

function ToolPanel({ title, onClose, className, children }: { title: string; onClose: () => void; className?: string; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    // Phones: a bottom sheet just above the action bar, full width, so it never floats over the middle of the question.
    <section
      aria-label={title}
      className={cn(
        "rise fixed bottom-24 right-4 z-40 rounded-xl border border-line-strong bg-surface p-3 shadow-[var(--shadow-pop)] sm:right-6",
        className,
        "max-sm:inset-x-0 max-sm:bottom-[4.5rem] max-sm:max-h-[60vh] max-sm:w-auto max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:px-4 max-sm:pb-4",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">{title}</h2>
        <IconButton icon="x" label={`Close ${title.toLowerCase()}`} onClick={onClose} className="size-8" />
      </div>
      {children}
    </section>
  );
}
