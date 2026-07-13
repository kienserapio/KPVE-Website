import type { CSSProperties, ReactNode } from "react";

type MarqueeProps = {
  children: ReactNode;
  /** seconds for one full loop */
  duration?: number;
  reverse?: boolean;
  /** gap between items, in rem */
  gap?: number;
  pauseOnHover?: boolean;
  className?: string;
};

/**
 * Seamless looping marquee. Renders the track twice and translates by -50%
 * so the loop is invisible. Duration and gap flow to CSS variables the
 * keyframe reads, so speed stays perfectly in sync with the content width.
 */
export function Marquee({
  children,
  duration = 45,
  reverse = false,
  gap = 1.5,
  pauseOnHover = true,
  className = "",
}: MarqueeProps) {
  const style = {
    "--marquee-duration": `${duration}s`,
    "--marquee-gap": `${gap}rem`,
    gap: `${gap}rem`,
  } as CSSProperties;

  return (
    <div className={`group flex overflow-hidden ${className}`}>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden={i === 1}
          style={style}
          className={`flex shrink-0 animate-[marquee_var(--marquee-duration)_linear_infinite] items-stretch ${
            reverse ? "[animation-direction:reverse]" : ""
          } ${pauseOnHover ? "group-hover:[animation-play-state:paused]" : ""}`}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
