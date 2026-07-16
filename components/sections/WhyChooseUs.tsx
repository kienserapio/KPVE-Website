import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { HERO_STATS, type ServiceWhyChooseUs } from "@/lib/data";

/**
 * Trust band — left heading + copy, right 3-up stats card. Content-driven,
 * reuses the shared HERO_STATS. Sits directly below the process timeline.
 */
export function WhyChooseUs({ data }: { data: ServiceWhyChooseUs }) {
  return (
    <section className="relative px-6 pb-24 sm:pb-32">
      <Reveal>
        <div className="mx-auto grid max-w-7xl items-center gap-10 rounded-3xl border-t border-white/12 bg-white/[0.05] px-6 py-12 sm:px-10 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
          <SectionHeading
            align="left"
            eyebrow={data.eyebrow}
            title={data.title}
            highlight={data.highlight}
            subtitle={data.body}
          />

          <div className="glass grid grid-cols-3 divide-x divide-white/10 rounded-3xl lg:justify-self-end">
            {HERO_STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center gap-1.5 px-4 py-7 text-center sm:px-7"
              >
                <span className="text-3xl font-medium text-gold-gradient sm:text-4xl">
                  {stat.value}
                </span>
                <span className="text-xs text-muted sm:text-sm">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
