import type { CSSProperties } from "react";

type Tone = "gold" | "white" | "black" | "current";

type IconProps = {
  /** path under /public, e.g. "/icons/design.svg" */
  src: string;
  className?: string;
  /**
   * Leave undefined to render the SVG with its own colors (the Figma icons
   * already ship the gold gradient). Set a tone to recolor a monochrome icon
   * (arrow, plus, quote, mail, check) via CSS mask.
   */
  tone?: Tone;
};

const toneClass: Record<Tone, string> = {
  gold: "bg-gold-gradient",
  white: "bg-white",
  black: "bg-black",
  current: "bg-current",
};

const maskBase: CSSProperties = {
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
};

/** Renders a project SVG icon — colored (image) or recolorable (mask). */
export function Icon({ src, className = "size-6", tone }: IconProps) {
  if (!tone) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden className={className} />;
  }
  return (
    <span
      aria-hidden
      className={`inline-block ${toneClass[tone]} ${className}`}
      style={{
        ...maskBase,
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
      }}
    />
  );
}
