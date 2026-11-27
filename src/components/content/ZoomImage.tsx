"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Primitives";

/**
 * A question/solution figure that opens full size on tap (scanned paper crops are small on phones). The image stays in
 * the server HTML with its alt text; the button only adds the zoom. In the dark theme `.q-img` dims white scans so they
 * stop glaring (globals.css).
 */
export function ZoomImage({ src, alt, width, height }: { src: string; alt: string; width?: number; height?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative block max-w-full cursor-zoom-in rounded-md text-left" aria-label={alt ? `Zoom image: ${alt}` : "Zoom image"}>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote public asset URL; dimensions are supplied by the API when known */}
        <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" className="q-img h-auto max-w-full rounded-md border border-line bg-white/5" />
        <span aria-hidden className="absolute bottom-1.5 right-1.5 rounded bg-bg/80 px-1.5 py-0.5 text-[10px] text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100">
          Tap to zoom
        </span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Image" wide className="max-w-[min(96vw,64rem)]!">
        <div className="max-h-[78vh] overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element -- same remote asset at full size */}
          <img src={src} alt={alt} className="q-img h-auto w-full min-w-[min(100%,40rem)] rounded-md bg-white" />
        </div>
      </Dialog>
    </>
  );
}
