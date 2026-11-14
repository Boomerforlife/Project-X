import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:bg-fg-soft active:translate-y-px",
  secondary: "border border-line-strong text-fg hover:border-fg hover:bg-surface-2",
  ghost: "text-fg-soft hover:text-fg hover:bg-surface-2",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-[0.95rem] gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  pixel = false,
  className,
}: { variant?: Variant; size?: Size; pixel?: boolean; className?: string } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center font-medium whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-40",
    pixel ? "pixel-corners" : "rounded-md",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

type Common = { variant?: Variant; size?: Size; pixel?: boolean };

export function Button({ variant, size, pixel, className, ...rest }: ComponentProps<"button"> & Common) {
  return <button className={buttonClass({ variant, size, pixel, className })} {...rest} />;
}

export function ButtonLink({ variant, size, pixel, className, ...rest }: ComponentProps<typeof Link> & Common) {
  return <Link className={buttonClass({ variant, size, pixel, className })} {...rest} />;
}
