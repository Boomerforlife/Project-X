import Link from "next/link";
import { KittyMark } from "@/components/brand/Kitty";
import { SITE } from "@/lib/site";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 rounded-md" aria-label={`${SITE.name} home`}>
      <KittyMark className="h-5 w-auto text-fg transition-transform group-hover:-rotate-6" />
      <span className="font-display text-[1.05rem] font-semibold tracking-tight">{SITE.name}</span>
    </Link>
  );
}
