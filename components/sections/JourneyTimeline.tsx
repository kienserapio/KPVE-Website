import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { ABOUT_JOURNEY } from "@/lib/data";

/**
 * "Our Journey" — a milestone timeline the original Figma didn't have. A dashed
 * gold spine threads four year-nodes; horizontal on desktop, vertical on mobile.
 */
export function JourneyTimeline() {
  const { milestones } = ABOUT_JOURNEY;

  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow={ABOUT_JOURNEY.eyebrow}
          title={ABOUT_JOURNEY.title}
          highlight={ABOUT_JOURNEY.highlight}
          subtitle={ABOUT_JOURNEY.subtitle}
        />

        {/* ---- desktop: horizontal spine ---- */}
        <div className="relative mt-20 hidden lg:block">
          {/* the spine */}
          <span className="absolute left-0 right-0 top-[14px] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="grid grid-cols-4 gap-6">
            {milestones.map((m, i) => (
              <Reveal key={m.year} delay={i * 0.12} className="relative">
                {/* node */}
                <span className="relative z-10 flex size-7 items-center justify-center rounded-full border border-gold/40 bg-ink">
                  <span className="size-2.5 rounded-full bg-gold-bright shadow-[0_0_12px_2px_rgba(233,192,75,0.5)]" />
                </span>
                <div className="mt-7 pr-4">
                  <div className="text-3xl font-medium text-gold-gradient">
                    {m.year}
                  </div>
                  <h3 className="mt-3 text-lg font-medium text-white">
                    {m.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-7 text-muted">
                    {m.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ---- mobile: vertical spine ---- */}
        <div className="relative mt-14 flex flex-col gap-10 lg:hidden">
          <span className="absolute bottom-2 left-[13px] top-2 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
          {milestones.map((m, i) => (
            <Reveal key={m.year} delay={i * 0.1} className="relative flex gap-5">
              <span className="relative z-10 mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-ink">
                <span className="size-2.5 rounded-full bg-gold-bright" />
              </span>
              <div>
                <div className="text-2xl font-medium text-gold-gradient">
                  {m.year}
                </div>
                <h3 className="mt-1.5 text-lg font-medium text-white">
                  {m.title}
                </h3>
                <p className="mt-1.5 text-[15px] leading-7 text-muted">
                  {m.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
