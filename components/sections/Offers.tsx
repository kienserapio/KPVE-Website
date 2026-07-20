import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { Icon } from "@/components/ui/Icon";
import { ABOUT_OFFERS } from "@/lib/data";

/**
 * "KPVE Offers" — the two flagship engagement models rendered as wide, numbered
 * spotlight cards with a gold accent rail.
 */
export function Offers() {
  return (
    <section id="offers" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow={ABOUT_OFFERS.eyebrow}
          title={ABOUT_OFFERS.title}
          highlight={ABOUT_OFFERS.highlight}
        />

        <div className="mt-16 grid gap-5 lg:grid-cols-2">
          {ABOUT_OFFERS.items.map((offer, i) => (
            <Reveal key={offer.title} delay={i * 0.12}>
              <SpotlightCard className="group card-dots relative h-full rounded-[24px] border-t border-white/12 bg-white/[0.05] p-8 transition-transform duration-300 hover:-translate-y-1 sm:p-10">
                {/* gold accent rail */}
                <span className="absolute inset-y-8 left-0 w-px bg-gradient-to-b from-transparent via-gold/60 to-transparent" />

                <div className="relative z-10 flex h-full flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <span className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                      <Icon src={offer.icon} className="size-7" />
                    </span>
                    <span className="text-5xl font-semibold text-white/[0.08] transition-colors duration-300 group-hover:text-white/[0.14]">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="text-2xl font-medium text-white">
                    {offer.title}
                  </h3>
                  <p className="text-[16px] leading-8 text-white/70">
                    {offer.body}
                  </p>
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
