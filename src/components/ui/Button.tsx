import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "plus";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:bg-fg-soft active:translate-y-px",
  secondary: "border border-line-strong text-fg hover:border-fg hover:bg-surface-2",
  ghost: "text-fg-soft hover:text-fg hover:bg-surface-2",
  // Tabby Plus purchase actions only (pricing, upgrade prompts). --bg text on --plus is >= 5.5:1 in both themes.
  plus: "bg-plus text-bg hover:bg-plus/85 active:translate-y-px",
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

/**
 * Icon-only button: always has an accessible label (also its tooltip), a 36px target on larger screens and 44px on
 * phones. Use it instead of one-off `grid size-9 place-items-center` buttons.
 */
export function IconButton({ icon, label, className, iconClassName, ...rest }: Omit<ComponentProps<"button">, "children" | "aria-label"> & { icon: IconName; label: string; iconClassName?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("grid size-9 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40 max-sm:size-11", className)}
      {...rest}
    >
      <Icon name={icon} className={cn("size-4", iconClassName)} />
    </button>
  );
}

/** The one text-field style (sign-in forms, numerical answers, search). */
export function inputClass(className?: string) {
  return cn("h-11 w-full rounded-lg border border-line-strong bg-bg px-3 outline-none transition-colors focus:border-fg disabled:opacity-60", className);
}
