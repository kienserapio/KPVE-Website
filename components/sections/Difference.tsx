import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { Icon } from "@/components/ui/Icon";
import { ABOUT_DIFFERENCE } from "@/lib/data";

/** "The KPVE difference" — three reasons teams stay, as a spotlight card grid. */
export function Difference() {
  return (
    <section id="difference" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow={ABOUT_DIFFERENCE.eyebrow}
          title={ABOUT_DIFFERENCE.title}
          highlight={ABOUT_DIFFERENCE.highlight}
          subtitle={ABOUT_DIFFERENCE.subtitle}
        />

        <div className="mt-16 grid gap-5 lg:grid-cols-3">
          {ABOUT_DIFFERENCE.items.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.1}>
              <SpotlightCard className="card-dots h-full rounded-2xl border-t border-white/12 bg-white/[0.05] p-8 transition-transform duration-300 hover:-translate-y-1">
                <div className="relative z-10 flex h-full flex-col gap-6">
                  <span className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                    <Icon src={item.icon} className="size-6" />
                  </span>
                  <h3 className="text-xl font-medium text-white">
                    {item.title}
                  </h3>
                  <p className="text-[15px] leading-7 text-white/70">
                    {item.body}
                  </p>
                  <span className="mt-auto h-px w-full bg-gradient-to-r from-gold/40 to-transparent" />
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
