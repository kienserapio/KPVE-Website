/* eslint-disable @next/next/no-img-element */
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ABOUT_FOUNDER } from "@/lib/data";

/**
 * "The Beginning" — founder portrait in a gold-ringed circle beside the origin
 * story. The portrait sits in a dotted disc with concentric rings and an
 * "Est. 2012" badge, mirroring the Figma composition.
 */
export function FounderStory() {
  return (
    <section id="story" className="relative py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-[minmax(0,0.9fr)_1fr] lg:gap-20">
        {/* ---- portrait ---- */}
        <Reveal className="relative mx-auto w-full max-w-md lg:mx-0">
          <div className="relative aspect-square">
            {/* concentric rings */}
            <span className="absolute inset-0 rounded-full border border-white/10" />
            <span className="absolute inset-[8%] rounded-full border border-white/[0.07]" />
            {/* gold glow */}
            <span className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_50%_35%,rgba(189,139,40,0.22),transparent_65%)] blur-xl" />
            {/* photo disc */}
            <div className="card-dots absolute inset-[10%] overflow-hidden rounded-full border border-white/10 bg-gradient-to-b from-surface-2 to-ink">
              <img
                src={ABOUT_FOUNDER.image}
                alt={ABOUT_FOUNDER.name}
                className="absolute inset-0 size-full object-cover object-top"
              />
            </div>
            {/* Est. badge */}
            <div className="glass absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5">
              <span className="size-2 rounded-full bg-gold-bright shadow-[0_0_12px_2px_rgba(233,192,75,0.6)]" />
              <span className="text-sm font-medium tracking-wide text-white">
                {ABOUT_FOUNDER.since}
              </span>
            </div>
          </div>
        </Reveal>

        {/* ---- story ---- */}
        <div className="flex flex-col items-start gap-7">
          <Reveal>
            <Eyebrow>{ABOUT_FOUNDER.eyebrow}</Eyebrow>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="text-4xl font-medium leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[56px]">
              {ABOUT_FOUNDER.title}
            </h2>
          </Reveal>

          <div className="flex flex-col gap-5">
            {ABOUT_FOUNDER.paragraphs.map((p, i) => (
              <Reveal key={i} delay={0.16 + i * 0.08}>
                <p className="max-w-xl text-[17px] leading-8 text-muted-3">{p}</p>
              </Reveal>
            ))}
          </div>

          {/* signature card */}
          <Reveal delay={0.32}>
            <figcaption className="mt-2 flex items-center gap-4 rounded-2xl border-t border-white/10 bg-white/[0.04] px-5 py-4">
              <span className="grid size-12 place-items-center rounded-full border border-gold/30 bg-gold/10 text-lg font-semibold text-gold-soft">
                DK
              </span>
              <div>
                <div className="text-lg font-medium text-white">
                  {ABOUT_FOUNDER.name}
                </div>
                <div className="text-sm text-gold-soft">{ABOUT_FOUNDER.role}</div>
              </div>
            </figcaption>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
