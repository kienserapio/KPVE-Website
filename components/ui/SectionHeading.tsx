import { Reveal } from "./Reveal";
import { Eyebrow } from "./Eyebrow";

type SectionHeadingProps = {
  eyebrow: string;
  /** plain leading part of the title */
  title: string;
  /** part of the title rendered in the gold gradient */
  highlight?: string;
  subtitle?: string;
  align?: "left" | "center";
  /** keep the title on a single line (no wrap, no max-width clamp) */
  singleLine?: boolean;
  className?: string;
};

/** Eyebrow + two-tone title + subtitle, reused by every section header. */
export function SectionHeading({
  eyebrow,
  title,
  highlight,
  subtitle,
  align = "center",
  singleLine = false,
  className = "",
}: SectionHeadingProps) {
  const centered = align === "center";
  return (
    <div
      className={`flex flex-col gap-6 ${
        centered ? "items-center text-center" : "items-start text-left"
      } ${className}`}
    >
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal delay={0.08}>
        <h2
          className={`text-balance font-medium leading-[1.08] tracking-tight text-white ${
            singleLine
              ? "whitespace-nowrap text-3xl sm:text-4xl lg:text-[52px]"
              : "max-w-3xl text-4xl sm:text-5xl lg:text-[62px]"
          }`}
        >
          {title}{" "}
          {highlight && <span className="text-gold-gradient">{highlight}</span>}
        </h2>
      </Reveal>
      {subtitle && (
        <Reveal delay={0.16}>
          <p
            className={`max-w-xl text-base leading-7 text-muted ${
              centered ? "mx-auto" : ""
            }`}
          >
            {subtitle}
          </p>
        </Reveal>
      )}
    </div>
  );
}
