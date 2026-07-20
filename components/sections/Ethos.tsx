"use client";

import { useState } from "react";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { Icon } from "@/components/ui/Icon";
import { ABOUT_ETHOS } from "@/lib/data";

/** clip-paths that stack into a clean pyramid (apex → base). */
const TIER_SHAPE = [
  "polygon(50% 0%, 100% 100%, 0% 100%)", // apex — Vision
  "polygon(23% 0%, 77% 0%, 100% 100%, 0% 100%)", // Mission
  "polygon(16% 0%, 84% 0%, 100% 100%, 0% 100%)", // Story
];
const TIER_WIDTH = ["36%", "68%", "100%"];
const TIER_HEIGHT = [92, 84, 84];

export function Ethos() {
  const { tiers } = ABOUT_ETHOS;
  const [active, setActive] = useState(tiers.length - 1); // default: Story
  const activeTier = tiers[active];

  return (
    <section id="ethos" className="relative py-24 sm:py-32">
      {/* full-bleed glass band */}
      <div className="full-bleed relative overflow-hidden border-y border-white/12 bg-gradient-to-b from-white/[0.05] to-transparent px-6 py-16 sm:py-24">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40" />

        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2 lg:gap-20">
          {/* ---- copy ---- */}
          <div className="flex flex-col items-start gap-7">
            <SectionHeading
              align="left"
              eyebrow={ABOUT_ETHOS.eyebrow}
              title={ABOUT_ETHOS.title}
              highlight={ABOUT_ETHOS.highlight}
            />
            <div className="flex flex-col gap-5">
              {ABOUT_ETHOS.paragraphs.map((p, i) => (
                <Reveal key={i} delay={0.12 + i * 0.08}>
                  <p className="max-w-xl text-[17px] leading-8 text-muted-3">
                    {p}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>

          {/* ---- pyramid ---- */}
          <Reveal delay={0.1}>
            <div className="flex flex-col items-center gap-8">
              <div className="flex w-full max-w-sm flex-col items-center gap-2">
                {tiers.map((tier, i) => {
                  const on = active === i;
                  return (
                    <button
                      key={tier.key}
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onClick={() => setActive(i)}
                      aria-pressed={on}
                      className="group relative flex items-end justify-center transition-transform duration-300 ease-out-soft hover:-translate-y-0.5"
                      style={{ width: TIER_WIDTH[i], height: TIER_HEIGHT[i] }}
                    >
                      {/* gold slab */}
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-gold-gradient transition-all duration-300"
                        style={{
                          clipPath: TIER_SHAPE[i],
                          opacity: on ? 1 : 0.42,
                          filter: on ? "brightness(1.08)" : "none",
                        }}
                      />
                      {/* label */}
                      <span
                        className={`relative z-10 mb-2.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide transition-colors duration-300 ${
                          on ? "text-black" : "text-black/55"
                        }`}
                      >
                        <Icon
                          src={tier.icon}
                          tone="black"
                          className={`size-3.5 ${on ? "opacity-90" : "opacity-45"}`}
                        />
                        {tier.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* active caption */}
              <div className="glass w-full max-w-sm rounded-2xl px-6 py-5 text-center">
                <div className="text-sm font-medium text-gold-soft">
                  {activeTier.label}
                </div>
                <p className="mt-2 text-[15px] leading-7 text-white/85">
                  {activeTier.body}
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
