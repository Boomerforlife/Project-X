import { PRIVATE_METADATA } from "@/lib/seo";

/**
 * CBT exam shell (CLAUDE.md §6C): its own chrome, no site header, and the
 * kitty mascot never appears anywhere under this layout.
 */
export const metadata = PRIVATE_METADATA;

export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
