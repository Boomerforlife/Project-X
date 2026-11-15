import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import type { Crumb } from "@/lib/seo";
import { cn } from "@/lib/cn";

export function PageHeader({
  crumbs,
  eyebrow,
  title,
  titleClass,
  lede,
  children,
}: {
  crumbs: Crumb[];
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  titleClass?: string;
  lede?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-10 sm:px-6 sm:pt-10 sm:pb-12">
        <Breadcrumbs items={crumbs} />
        {eyebrow && <div className="mt-8 font-pixel text-xs uppercase tracking-[0.2em] text-fg-muted">{eyebrow}</div>}
        <h1 className={cn("mt-3 text-4xl font-semibold sm:text-5xl", !eyebrow && "mt-8", titleClass)}>{title}</h1>
        {lede && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">{lede}</p>}
        {children}
      </div>
    </header>
  );
}

export function EmptyState({
  title,
  body,
  kitty,
  children,
}: {
  title: string;
  body: React.ReactNode;
  kitty?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
      {kitty}
      <h2 className="mt-6 text-xl font-semibold">{title}</h2>
      <div className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">{body}</div>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
