import type { CSSProperties } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Icon } from "@/components/ui/Icon";
import { GLOBAL_PRESENCE } from "@/lib/data";

/**
 * Coarse equirectangular land mask (60 cols × 24 rows, 6° per cell).
 * Each "1" becomes a subtle gold dot — together they read as a world map.
 */
const LAND: string[] = [
  "000000000000000011111111100000000000000000000000000000000000",
  "000000000011111111110111110000000000000011111111111111111000",
  "000000111111111111110111110000011111111111111111111111111110",
  "000011111111111111111011110000111111111111111111111111111110",
  "000111111111111111111000000000111111111111111111111111111110",
  "000111111111111111111000000011011111111111111111111111111110",
  "000011111111111111111000000000111111111111111111111111111110",
  "000001111111111111111000000001111111111111111111111111111110",
  "000000111111111111000000001111111111111111111111111111110000",
  "000000001111111111000000000111111111111111111111111111111000",
  "000000000011111110000000001111111111111111111111111111110000",
  "000000000000011110000000011111111111111111111111111111100000",
  "000000000000000110000000011111111111111110000111111111100000",
  "000000000000000001111111001111111111111111100000011111110000",
  "000000000000000001111111000011111111111100000000011111110000",
  "000000000000000001111111100001111111111100000000001111110000",
  "000000000000000001111111000000111111111000000000000111111000",
  "000000000000000000111110000000011111110000000000001111111000",
  "000000000000000000111100000000001111110000000000011111111000",
  "000000000000000000111100000000000111100000000000001111110000",
  "000000000000000000111000000000000011000000000000000111100000",
  "000000000000000000111000000000000000000000000000000000000110",
  "000000000000000000110000000000000000000000000000000000000000",
  "000000000000000000100000000000000000000000000000000000000000",
];

const COLS = 60;
const ROWS = LAND.length;

// pre-compute land dot centres in the 60×24 coordinate space
const DOTS: { x: number; y: number }[] = [];
LAND.forEach((row, y) => {
  for (let x = 0; x < row.length; x++) {
    if (row[x] === "1") DOTS.push({ x: x + 0.5, y: y + 0.5 });
  }
});

// live hubs — placed by real lon/lat, expressed as % of the map box
type Pin = { name: string; x: number; y: number };
const PINS: Pin[] = [
  { name: "New York", x: 30.3, y: 32.6 },
  { name: "London", x: 50.8, y: 25 },
  { name: "Dubai", x: 66.1, y: 43.1 },
  { name: "Singapore", x: 79.7, y: 59.5 },
  { name: "Sydney", x: 92.8, y: 83.9 },
  { name: "São Paulo", x: 37.9, y: 76.8 },
];

// subtle great-circle-ish connectors between hubs (100×100 space, arcs up)
const ARCS: string[] = [
  "M50.8 25 Q40.6 13 30.3 32.6",
  "M50.8 25 Q58.5 13 66.1 43.1",
  "M66.1 43.1 Q72.9 31 79.7 59.5",
  "M79.7 59.5 Q86.3 47.5 92.8 83.9",
  "M30.3 32.6 Q26 54 37.9 76.8",
];

export function GlobalPresence() {
  return (
    <section className="relative overflow-hidden px-6 py-24 sm:py-28">
      {/* ambient wash */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 bottom-[-10%] h-[60%] bg-[radial-gradient(55%_100%_at_50%_100%,rgba(189,139,40,0.08),transparent)]" />
      </div>

      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow={GLOBAL_PRESENCE.eyebrow}
          title={GLOBAL_PRESENCE.title}
          highlight={GLOBAL_PRESENCE.highlight}
          subtitle={GLOBAL_PRESENCE.subtitle}
        />

        <Reveal delay={0.1} className="mt-14">
          <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent">
            {/* soft gold glow bleeding up from the centre */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_75%_at_50%_55%,rgba(189,139,40,0.14),transparent)]" />

            {/* map box — sets the aspect ratio everything is positioned against */}
            <div className="relative aspect-[16/11] w-full sm:aspect-[2.5/1]">
              {/* dotted world map, faded at the edges */}
              <div
                className="absolute inset-0"
                style={{
                  WebkitMaskImage:
                    "radial-gradient(120% 120% at 50% 45%, #000 55%, transparent 100%)",
                  maskImage:
                    "radial-gradient(120% 120% at 50% 45%, #000 55%, transparent 100%)",
                }}
              >
                <svg
                  viewBox={`0 0 ${COLS} ${ROWS}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="h-full w-full"
                  aria-hidden
                >
                  {DOTS.map((d, i) => (
                    <circle
                      key={i}
                      cx={d.x}
                      cy={d.y}
                      r={0.34}
                      className="fill-gold-soft"
                      opacity={0.32}
                    />
                  ))}
                </svg>
              </div>

              {/* connective arcs between hubs */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
                aria-hidden
              >
                {ARCS.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke="rgba(233,192,75,0.35)"
                    strokeWidth={0.25}
                    strokeDasharray="1.4 2.4"
                    className="animate-dashflow"
                    style={{ animationDelay: `${i * 0.4}s` } as CSSProperties}
                  />
                ))}
              </svg>

              {/* live glass pins */}
              {PINS.map((pin, i) => (
                <span
                  key={pin.name}
                  className="absolute"
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  title={pin.name}
                >
                  <span className="relative block -translate-x-1/2 -translate-y-1/2">
                    {/* blinking halo */}
                    <span
                      className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-gold-bright/25"
                      style={{ animationDelay: `${i * 0.5}s` } as CSSProperties}
                    />
                    {/* glass pin body */}
                    <span className="glass relative grid size-4 place-items-center rounded-full border border-gold/50 shadow-[0_0_14px_rgba(233,192,75,0.65)]">
                      <span
                        className="size-1.5 animate-blink rounded-full bg-gold-bright"
                        style={{ animationDelay: `${i * 0.4}s` } as CSSProperties}
                      />
                    </span>
                  </span>
                </span>
              ))}

              {/* centre caption */}
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white/90">
                  <Icon src="/icons/location.svg" tone="gold" className="size-4" />
                  {GLOBAL_PRESENCE.caption}
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
