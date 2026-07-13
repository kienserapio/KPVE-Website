"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type MouseEvent,
} from "react";

type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
  /** radius of the light in px */
  radius?: number;
  /** peak opacity of the white light */
  intensity?: number;
};

/**
 * Card wrapper that renders a soft white blurred light following the cursor,
 * plus a subtle border-glow, on hover. Position is fed to CSS via variables
 * so the paint happens on the GPU with no React re-render per mousemove.
 */
export function SpotlightCard({
  children,
  className = "",
  radius = 340,
  intensity = 0.14,
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  const style = {
    "--spot-radius": `${radius}px`,
    "--spot-intensity": active ? intensity : 0,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      style={style}
      className={`group/spot relative overflow-hidden ${className}`}
    >
      {/* white blurred light */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={{
          opacity: "var(--spot-intensity)",
          background:
            "radial-gradient(var(--spot-radius) circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.9), rgba(255,255,255,0) 60%)",
        }}
      />
      {/* faint border highlight following the cursor */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          background:
            "radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(189,139,40,0.10), rgba(255,255,255,0) 65%)",
        }}
      />
      <div className="relative z-20 h-full">{children}</div>
    </div>
  );
}
