import { ImageResponse } from "next/og";
import { KITTY_PATHS } from "@/components/brand/Kitty";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#080808",
          color: "#fff",
          padding: "80px 96px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 36, color: "#8f8f8f", letterSpacing: 4 }}>{SITE.name.toUpperCase()}</div>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, maxWidth: 640 }}>{SITE.tagline}</div>
          <div style={{ display: "flex", gap: 16, fontSize: 30 }}>
            <span style={{ color: "#60a5fa" }}>Physics</span>
            <span style={{ color: "#4ade80" }}>Chemistry</span>
            <span style={{ color: "#facc15" }}>Mathematics</span>
          </div>
        </div>
        <svg width="360" height="335" viewBox="70 80 430 400">
          <path d={KITTY_PATHS.BODY} fill="#fff" />
          <rect x="123" y="189" width="21" height="49" rx="5" fill="#080808" />
          <rect x="209" y="189" width="22" height="49" rx="5" fill="#080808" />
          <path d={KITTY_PATHS.TAIL} fill="none" stroke="#fff" strokeWidth="15" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
