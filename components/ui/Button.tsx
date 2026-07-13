import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

type Variant = "gold" | "glass" | "ghost";

type ButtonProps = {
  children: ReactNode;
  href?: string;
  variant?: Variant;
  className?: string;
  icon?: boolean;
};

const base =
  "group/btn inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-all duration-300 ease-out will-change-transform active:scale-[0.97]";

const variants: Record<Variant, string> = {
  gold: "bg-gold-gradient px-6 py-3.5 text-black shadow-[0_8px_30px_-8px_rgba(189,139,40,0.6)] hover:shadow-[0_12px_40px_-8px_rgba(233,192,75,0.75)] hover:brightness-110 hover:-translate-y-0.5",
  glass:
    "glass px-6 py-3.5 text-muted-3 hover:text-white hover:border-white/20 hover:-translate-y-0.5",
  ghost:
    "border border-line-2 bg-surface-2/60 px-6 py-3.5 text-white hover:border-gold/40 hover:-translate-y-0.5",
};

export function Button({
  children,
  href = "#",
  variant = "gold",
  className = "",
  icon = false,
}: ButtonProps) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
      {icon && (
        <Icon
          src="/icons/arrow.svg"
          tone={variant === "gold" ? "black" : "white"}
          className="size-4 transition-transform duration-300 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5"
        />
      )}
    </Link>
  );
}
