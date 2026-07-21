import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";
import { cn } from "@/lib/utils";

type Variant = "gold" | "glass" | "ghost";
type Size = "md" | "sm";

const base =
  "group/btn inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-300 ease-out will-change-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:pointer-events-none disabled:opacity-55";

const variants: Record<Variant, string> = {
  gold: "bg-gold-gradient text-black shadow-[0_8px_30px_-8px_rgba(189,139,40,0.6)] hover:shadow-[0_12px_40px_-8px_rgba(233,192,75,0.75)] hover:brightness-110 hover:-translate-y-0.5",
  glass:
    "glass text-muted-3 hover:text-white hover:border-white/20 hover:-translate-y-0.5",
  ghost:
    "border border-line-2 bg-surface-2/60 text-white hover:border-gold/40 hover:-translate-y-0.5",
};

const sizes: Record<Size, string> = {
  md: "px-6 py-3.5 text-sm",
  sm: "px-4 py-2.5 text-xs",
};

type CommonProps = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  icon?: boolean;
};

type LinkProps = CommonProps & {
  href: string;
};

type NativeButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: never;
    loading?: boolean;
  };

type ButtonProps = LinkProps | NativeButtonProps;

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
    />
  );
}

/**
 * Renders a `next/link` when `href` is given, otherwise a real `<button>`.
 *
 * The button branch is what makes this usable in forms — it supports `type`,
 * `disabled`, `onClick` and a `loading` state. Before this existed, every form
 * in the codebase hand-rolled a `<button>` with the gold-gradient classes
 * copy-pasted.
 */
export function Button(props: ButtonProps) {
  const {
    children,
    variant = "gold",
    size = "md",
    className,
    icon = false,
  } = props;

  const classes = cn(base, variants[variant], sizes[size], className);
  const iconTone = variant === "gold" ? "black" : "white";

  const arrow = icon ? (
    <Icon
      src="/icons/arrow.svg"
      tone={iconTone}
      className="size-4 transition-transform duration-300 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5"
    />
  ) : null;

  if ("href" in props && props.href !== undefined) {
    return (
      <Link href={props.href} className={classes}>
        {children}
        {arrow}
      </Link>
    );
  }

  // Strip the presentational props so they never land on the DOM node.
  const {
    variant: _variant,
    size: _size,
    className: _className,
    icon: _icon,
    children: _children,
    loading = false,
    disabled,
    type = "button",
    ...rest
  } = props as NativeButtonProps;
  void _variant;
  void _size;
  void _className;
  void _icon;
  void _children;

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
    >
      {loading ? <Spinner /> : null}
      {children}
      {loading ? null : arrow}
    </button>
  );
}
