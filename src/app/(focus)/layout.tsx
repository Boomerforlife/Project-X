import { PRIVATE_METADATA } from "@/lib/seo";

/** Distraction-free shell for practice sessions: no site navigation (CLAUDE.md §9). */
export const metadata = PRIVATE_METADATA;

export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
